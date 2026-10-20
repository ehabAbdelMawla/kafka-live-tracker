import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomUUID, randomBytes, timingSafeEqual } from 'crypto';
import { nanoid } from 'nanoid';
import { KafkaService } from '../kafka/kafka.service';
import { LocationEvent, SessionEvent, ViewerFix, toViewerFix } from '../events/location-event';
import { MemorySessionStore, Session, SessionStore } from './session.store';
import { TOPICS } from '../kafka/kafka.constants';

@Injectable()
export class SessionsService {
  // Keeps sessions in memory; swap the store (e.g. Redis) here later.
  private readonly store: SessionStore = new MemorySessionStore();

  constructor(private readonly kafka: KafkaService) {}

  async create(): Promise<{
    sessionId: string;
    shareId: string;
    trackerToken: string;
    shareUrl: string;
  }> {
    const session: Session = {
      sessionId: randomUUID(), // secret, never shown to viewers
      shareId: nanoid(16), // random enough to be unguessable, only thing in the public URL
      trackerToken: randomBytes(24).toString('hex'),
      status: 'ACTIVE',
      createdAt: Date.now(),
    };
    await this.store.create(session);

    const shareUrl = `${process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'}/track/${session.shareId}`;
    return {
      sessionId: session.sessionId,
      shareId: session.shareId,
      trackerToken: session.trackerToken,
      shareUrl,
    };
  }

  async stop(sessionId: string, token: string | undefined): Promise<{ status: 'ENDED' }> {
    const session = await this.assertTracker(sessionId, token);

    const at = Date.now();
    await this.store.end(sessionId, at);
    const event: SessionEvent = {
      eventId: randomUUID(),
      type: 'STOPPED',
      sessionId,
      shareId: session.shareId,
      at,
    };
    // Announce the stop on Kafka so the broadcaster (and any future consumer)
    // sees it, exactly like a location event.
    await this.kafka.publish(TOPICS.SESSION_EVENTS, sessionId, event);
    return { status: 'ENDED' };
  }

  // Shared guard: unknown session => 404, ended => 409, bad token => 401.
  async assertTracker(sessionId: string, token: string | undefined): Promise<Session> {
    const session = await this.store.getById(sessionId);
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'ENDED') throw new ConflictException('Session already ended');
    if (!token || !this.tokensEqual(token, session.trackerToken)) {
      throw new UnauthorizedException('Invalid tracker token');
    }
    return session;
  }

  async getPublicSnapshot(
    shareId: string,
  ): Promise<{ status: 'ACTIVE' | 'ENDED'; lastLocation: ViewerFix | null } | null> {
    const session = await this.store.getByShareId(shareId);
    if (!session) return null;
    const last = await this.store.getLastLocation(session.sessionId);
    return { status: session.status, lastLocation: last ? toViewerFix(last) : null };
  }

  // Called by the locations service so new viewers instantly get a snapshot.
  async setLastLocation(sessionId: string, event: LocationEvent): Promise<void> {
    await this.store.setLastLocation(sessionId, event);
  }

  // Compare secrets in constant time so response delay cannot leak hints.
  private tokensEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Still burn comparable time on a fake compare before bailing out.
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  }
}
