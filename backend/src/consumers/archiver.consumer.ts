import { Injectable, OnModuleInit } from '@nestjs/common';
import { appendFile, mkdir } from 'fs/promises';
import path from 'path';
import { KafkaService } from '../kafka/kafka.service';
import { GROUPS, TOPICS } from '../kafka/kafka.constants';
import { LocationEvent } from '../events/location-event';

/**
 * Consumer group: location-archiver.
 * Appends every location event as one JSON line to data/history.jsonl.
 * Exists to prove fan-out: the second group reads the same messages
 * independently; a slow archiver cannot slow the broadcaster.
 */
@Injectable()
export class ArchiverConsumer implements OnModuleInit {
  private readonly filePath = path.join(process.cwd(), 'data', 'history.jsonl');

  constructor(private readonly kafka: KafkaService) {}

  async onModuleInit() {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await this.kafka.subscribe<LocationEvent>(
      GROUPS.ARCHIVER,
      TOPICS.LOCATION_UPDATES,
      async (event) => {
        await appendFile(this.filePath, JSON.stringify(event) + '\n');
      },
    );
  }
}
