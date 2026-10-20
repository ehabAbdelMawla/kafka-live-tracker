import { LocationEvent } from '../events/location-event';

// The store interface exists so the in-memory implementation can be swapped
// for a Redis implementation later without touching any other code.
export interface SessionStore {
  create(session: Session): Promise<void>;
  getById(sessionId: string): Promise<Session | null>;
  getByShareId(shareId: string): Promise<Session | null>;
  end(sessionId: string, endedAt: number): Promise<void>;
  setLastLocation(sessionId: string, location: LocationEvent): Promise<void>;
  getLastLocation(sessionId: string): Promise<LocationEvent | null>;
}

export interface Session {
  sessionId: string;
  shareId: string;
  trackerToken: string;
  status: 'ACTIVE' | 'ENDED';
  createdAt: number;
  endedAt?: number;
}

// In-memory session store. Sessions are lost on process restart, which the
// plan accepts for the learning build. A sweep removes sessions older than
// TTL_MS (12 h) and anything ENDED.
export class MemorySessionStore implements SessionStore {
  private static readonly TTL_MS = 12 * 60 * 60 * 1000;
  private readonly sessions = new Map<string, Session>(); // sessionId -> session
  private readonly shareIndex = new Map<string, string>(); // shareId -> sessionId
  private readonly lastLocations = new Map<string, LocationEvent>(); // sessionId -> last fix
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    this.sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000);
    this.sweeper.unref(); // do not keep the process alive just for sweeping
  }

  async create(session: Session): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
    this.shareIndex.set(session.shareId, session.sessionId);
  }

  async getById(sessionId: string): Promise<Session | null> {
    return this.copy(this.sessions.get(sessionId));
  }

  async getByShareId(shareId: string): Promise<Session | null> {
    const sessionId = this.shareIndex.get(shareId);
    if (!sessionId) return null;
    return this.copy(this.sessions.get(sessionId));
  }

  async end(sessionId: string, endedAt: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'ENDED';
      session.endedAt = endedAt;
    }
  }

  async setLastLocation(sessionId: string, location: LocationEvent): Promise<void> {
    this.lastLocations.set(sessionId, location);
  }

  async getLastLocation(sessionId: string): Promise<LocationEvent | null> {
    return this.lastLocations.get(sessionId) ?? null;
  }

  private sweep(): void {
    const cutoff = Date.now() - MemorySessionStore.TTL_MS;
    for (const [sessionId, session] of this.sessions) {
      if (session.status === 'ENDED' || session.createdAt < cutoff) {
        this.shareIndex.delete(session.shareId);
        this.lastLocations.delete(sessionId);
        this.sessions.delete(sessionId);
      }
    }
  }

  // Return a clone so callers cannot mutate the stored object.
  private copy(session: Session | undefined): Session | null {
    return session ? { ...session } : null;
  }
}
