import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Admin, Consumer, Kafka, Producer, logLevel } from 'kafkajs';
import { TOPICS } from './kafka.constants';

// kafkajs reads this warning flag while this module loads; set a fallback here
// (the .env copy in process.env may not be ready yet when ConfigModule boots).
process.env.KAFKAJS_NO_PARTITIONER_WARNING ??= '1';

interface Subscription {
  topic: string;
  handler: (value: unknown) => Promise<void>;
}

/**
 * Core of the Kafka learning: one producer, one admin client, one consumer
 * PER GROUP. Subscriptions are collected during module init and started
 * together on application bootstrap, so a group's consumer knows ALL of its
 * topics before it runs (kafkajs must subscribe before run()).
 */
@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy, OnApplicationBootstrap {
  private readonly logger = new Logger(KafkaService.name);

  // One Kafka client (connection pool) reused for admin, producer, consumers.
  private readonly kafka = new Kafka({
    clientId: 'live-tracker',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });

  // Idempotent producer: no duplicates on retries; maxInFlightRequests=1 keeps
  // strict ordering when a retried batch is re-sent.
  private readonly producer: Producer = this.kafka.producer({
    idempotent: true,
    maxInFlightRequests: 1,
  });

  private readonly admin: Admin = this.kafka.admin();
  private readonly subscriptions = new Map<string, Subscription[]>(); // groupId -> subs
  private consumers: Consumer[] = [];
  private bootstrapDone = false;

  async onModuleInit() {
    await this.ensureTopics(); // admin: create topics if missing (idempotent)
    await this.producer.connect(); // producer: one long-lived connection for all sends
  }

  /**
   * Register a handler for one topic inside a consumer group.
   * Same groupId both times = members share partitions (scale out).
   * Different groupId = every group gets every message (fan-out).
   * Call this from onModuleInit only; consumers start on application bootstrap.
   */
  subscribe<T>(groupId: string, topic: string, handler: (value: T) => Promise<void>) {
    if (this.bootstrapDone) {
      throw new Error(
        `subscribe(${groupId}, ${topic}) after bootstrap: register in onModuleInit`,
      );
    }
    const subs = this.subscriptions.get(groupId) ?? [];
    subs.push({ topic, handler: handler as (value: unknown) => Promise<void> });
    this.subscriptions.set(groupId, subs);
  }

  async onApplicationBootstrap() {
    this.bootstrapDone = true;
    for (const [groupId, subs] of this.subscriptions) {
      const consumer = this.kafka.consumer({ groupId });
      await consumer.connect();
      // A consumer follows every topic of its group: subscribe runs before
      // run(), otherwise the broker never assigns the extra topic's partitions.
      for (const sub of subs) {
        await consumer.subscribe({ topic: sub.topic, fromBeginning: false });
      }
      const byTopic = new Map(subs.map((s) => [s.topic, s.handler]));
      // Do NOT await run(): it only resolves when the consumer stops (disconnect),
      // and awaiting it here would block the rest of the boot.
      consumer
        .run({
          // Kafka does not push: the consumer polls its assigned partitions and
          // receives messages starting from its committed offsets.
          eachMessage: async ({ topic, partition, message }) => {
            if (!message.value) return;
            const handler = byTopic.get(topic);
            if (!handler) return; // subscribed but no handler registered
            try {
              await handler(JSON.parse(message.value.toString()));
            } catch (err) {
              // Log and continue. A bad message must never crash the consumer.
              this.logger.error(
                `[${groupId}] topic=${topic} partition=${partition} handler failed`,
                err as Error,
              );
            }
          },
        })
        .catch((err) =>
          this.logger.error(`[${groupId}] consumer run loop crashed`, err as Error),
        );
      this.consumers.push(consumer);
      this.logger.log(`[${groupId}] started, topics=[${subs.map((s) => s.topic).join(', ')}]`);
    }
  }

  async onModuleDestroy() {
    await Promise.all(this.consumers.map((c) => c.disconnect()));
    await this.producer.disconnect();
    await this.admin.disconnect();
  }

  /**
   * Create the app's topics if they do not exist yet. Safe on every boot:
   * existing topics are skipped.
   */
  private async ensureTopics() {
    await this.admin.connect();
    await this.admin.createTopics({
      waitForLeaders: true,
      topics: [
        {
          topic: TOPICS.LOCATION_UPDATES,
          numPartitions: 3, // 3 partitions = up to 3 consumers work in parallel per group
          replicationFactor: 1,
          configEntries: [{ name: 'retention.ms', value: '3600000' }], // keep location data 1 hour
        },
        {
          topic: TOPICS.SESSION_EVENTS,
          numPartitions: 1,
          replicationFactor: 1,
          configEntries: [{ name: 'retention.ms', value: '86400000' }], // session events 1 day
        },
      ],
    });
    await this.admin.disconnect();
  }

  /**
   * Publish one message.
   * The key (sessionId) decides the partition: hash(key) % 3, therefore every
   * point of one trip lands on the same partition and keeps its order.
   * acks=-1 waits for all in-sync replicas: strongest durability.
   */
  async publish(topic: string, key: string, value: object) {
    await this.producer.send({
      topic,
      acks: -1, // wait for all in-sync replicas
      messages: [{ key, value: JSON.stringify(value) }],
    });
  }
}
