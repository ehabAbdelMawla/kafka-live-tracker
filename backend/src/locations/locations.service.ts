import { HttpException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { KafkaService } from '../kafka/kafka.service';
import { TOPICS } from '../kafka/kafka.constants';
import { LocationEvent } from '../events/location-event';
import { SendLocationDto } from './dto/send-location.dto';
import { SessionsService } from '../sessions/sessions.service';

// Simple in-memory rate limit: reject more than one location per 500 ms per session.
const RATE_LIMIT_MS = 500;

@Injectable()
export class LocationsService {
  // sessionId -> timestamp of last accepted point.
  private readonly lastAcceptedAt = new Map<string, number>();

  constructor(
    private readonly sessions: SessionsService,
    private readonly kafka: KafkaService,
  ) {}

  /**
   * Validate ownership, then publish the point to Kafka.
   * The API does NOT talk to viewers directly: Kafka is in the middle, so
   * consumers can be slow/crashed without slowing down the tracker.
   */
  async ingest(sessionId: string, token: string | undefined, dto: SendLocationDto) {
    const session = await this.sessions.assertTracker(sessionId, token); // 404/409/401

    const now = Date.now();
    const last = this.lastAcceptedAt.get(sessionId) ?? 0;
    if (now - last < RATE_LIMIT_MS) {
      throw new HttpException('Too many location updates', 429);
    }
    this.lastAcceptedAt.set(sessionId, now);

    const event: LocationEvent = {
      eventId: randomUUID(), // deduplication id (at-least-once delivery!)
      sessionId,
      shareId: session.shareId,
      seq: dto.seq,
      lat: dto.lat,
      lng: dto.lng,
      accuracy: dto.accuracy,
      speed: dto.speed,
      heading: dto.heading,
      deviceTimestamp: dto.deviceTimestamp,
      receivedAt: now,
    };
    // Store the latest fix NOW so brand-new viewers get an instant snapshot.
    await this.sessions.setLastLocation(sessionId, event);
    // Publish with key=sessionId: all points of one trip go to the same
    // partition and therefore keep their order.
    await this.kafka.publish(TOPICS.LOCATION_UPDATES, sessionId, event);
  }
}
