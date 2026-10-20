import { API_URL } from './config';

// Secrets the TRACKER gets and must keep for itself.
export interface StartSession {
  sessionId: string;
  shareId: string;
  trackerToken: string;
  shareUrl: string;
}

// What a VIEWER may see: no sessionId, no token, ever.
export interface ShareSnapshot {
  status: 'ACTIVE' | 'ENDED';
  lastLocation: {
    lat: number;
    lng: number;
    accuracy?: number;
    speed?: number;
    heading?: number;
    seq: number;
    deviceTimestamp: number;
  } | null;
}

export interface LocationInput {
  seq: number;
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  deviceTimestamp: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function response<T>(res: globalThis.Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.message ?? detail;
    } catch {
      // not json, keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  startSession(): Promise<StartSession> {
    return fetch(`${API_URL}/api/sessions`, { method: 'POST' }).then((r) => response(r));
  },

  sendLocation(session: StartSession, input: LocationInput): Promise<void> {
    return fetch(`${API_URL}/api/sessions/${session.sessionId}/locations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tracker-token': session.trackerToken },
      body: JSON.stringify(input),
    }).then((r) => response<void>(r));
  },

  stopSession(session: StartSession): Promise<{ status: string }> {
    return fetch(`${API_URL}/api/sessions/${session.sessionId}/stop`, {
      method: 'POST',
      headers: { 'x-tracker-token': session.trackerToken },
    }).then((r) => response(r));
  },

  getShare(shareId: string): Promise<ShareSnapshot> {
    return fetch(`${API_URL}/api/share/${shareId}`).then((r) => response(r));
  },
};
