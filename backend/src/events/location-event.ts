export interface LocationEvent {
  eventId: string; // uuid, for deduplication
  sessionId: string;
  shareId: string; // lets the broadcaster pick the WebSocket room
  seq: number; // increments per session, set by the client
  lat: number; // -90..90
  lng: number; // -180..180
  accuracy?: number; // meters
  speed?: number; // m/s
  heading?: number; // degrees
  deviceTimestamp: number; // ms epoch from the phone
  receivedAt: number; // ms epoch set by the API
}

export interface SessionEvent {
  eventId: string;
  type: 'STARTED' | 'STOPPED';
  sessionId: string;
  shareId: string;
  at: number;
}

// Public view of a location fix: no sessionId, no internal ids.
export interface ViewerFix {
  lat: number;
  lng: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  seq: number;
  deviceTimestamp: number;
}

export function toViewerFix(event: LocationEvent): ViewerFix {
  return {
    lat: event.lat,
    lng: event.lng,
    accuracy: event.accuracy,
    speed: event.speed,
    heading: event.heading,
    seq: event.seq,
    deviceTimestamp: event.deviceTimestamp,
  };
}
