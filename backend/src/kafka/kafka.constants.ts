// Topic and consumer-group names live here so producer and consumers cannot drift apart.
export const TOPICS = {
  LOCATION_UPDATES: 'location.updates',
  SESSION_EVENTS: 'session.events',
} as const;

export const GROUPS = {
  BROADCASTER: 'location-broadcaster',
  ARCHIVER: 'location-archiver',
} as const;
