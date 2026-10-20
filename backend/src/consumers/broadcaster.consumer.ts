import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaService } from '../kafka/kafka.service';
import { GROUPS, TOPICS } from '../kafka/kafka.constants';
import { LocationEvent, SessionEvent, toViewerFix } from '../events/location-event';
import { LiveGateway } from '../gateway/live.gateway';

/**
 * Consumer group: location-broadcaster.
 * Purpose: push every location event to the WebSocket viewers.
 * Its own consumer group means it gets its own copy of the stream.
 */
@Injectable()
export class BroadcasterConsumer implements OnModuleInit {
  constructor(
    private readonly kafka: KafkaService,
    private readonly gateway: LiveGateway,
  ) {}

  async onModuleInit() {
    // Kafka does not push: this consumer continuously polls its assigned
    // partitions and receives messages starting from its committed offsets.
    await this.kafka.subscribe<LocationEvent>(
      GROUPS.BROADCASTER,
      TOPICS.LOCATION_UPDATES,
      async (event) => {
        this.gateway.emitLocation(event.shareId, toViewerFix(event));
      },
    );
    await this.kafka.subscribe<SessionEvent>(
      GROUPS.BROADCASTER,
      TOPICS.SESSION_EVENTS,
      async (event) => {
        if (event.type === 'STOPPED') this.gateway.emitEnded(event.shareId, event.at);
      },
    );
  }
}
