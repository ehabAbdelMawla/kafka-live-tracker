# Live GPS & Location Tracking: Kafka Learning Project

> **Purpose of this document**
> 1. A step-by-step build plan that a cheaper/smaller AI agent can follow without guessing.
> 2. A learning guide: every Kafka decision is explained so you can review the code and understand *why*.

---

## 0. Instructions for the implementing agent (read first)

1. Follow the phases in **Section 9** in order. Do not skip ahead. Each phase has an **acceptance check**; do not continue until it passes.
2. Build the **core** first (React + NestJS + Kafka). Redis and RabbitMQ are **optional** and are built last (Phases 8 and 9), behind feature flags.
3. Use **TypeScript** everywhere.
4. Use the **`kafkajs`** library directly inside NestJS providers (not `@nestjs/microservices` Kafka transport). Reason: see Section 5.3.
5. Keep code small and readable. Add a short comment above every Kafka call explaining what it does. The owner will review it to learn.
6. Do not add features that are not in this plan (no login system, no database, no maps API keys).
7. If something is ambiguous, pick the simplest option, and write the decision in `DECISIONS.md`.

---

## 1. What we are building

A small app where:

- A person opens the web app, taps **Start tracking**, and their phone's GPS position is sent to the backend every few seconds.
- The app shows a **share link**. Anyone who opens that link sees the person's **live position on a map**, updating in real time.
- The person taps **Stop tracking** and the link shows "Tracking ended".

### Scope

| In scope | Out of scope |
|---|---|
| Start / Stop tracking button | User accounts / login |
| Generate shareable live link | Persistent database (we use files / memory / optional Redis) |
| Live map for viewers | Native mobile apps |
| Kafka as the event backbone | Production deployment, Kubernetes |
| Optional Redis and RabbitMQ | Multi-cluster Kafka, schema registry |

### Two roles

- **Tracker**: the person sharing location. Uses `/` page. Has a secret `trackerToken`.
- **Viewer**: anyone with the link `/track/:shareId`. Read-only. No secret needed.

---

## 2. Architecture

```mermaid
flowchart LR
    subgraph Browser_Tracker[Tracker browser - React]
        A[Start / Stop buttons<br/>navigator.geolocation]
    end
    subgraph Backend[NestJS backend]
        B[REST API<br/>sessions + locations]
        P[Kafka Producer]
        C1[Consumer: broadcaster<br/>group = location-broadcaster]
        C2[Consumer: archiver<br/>group = location-archiver]
        G[Socket.IO Gateway /live]
    end
    K[(Kafka<br/>topics: location.updates<br/>session.events)]
    subgraph Browser_Viewer[Viewer browser - React]
        V[Leaflet map]
    end

    A -- HTTP POST location --> B
    B --> P --> K
    K --> C1 --> G -- WebSocket --> V
    K --> C2 --> F[(history.jsonl file)]
```

### Data flow in words

1. Tracker clicks **Start** → `POST /api/sessions` → backend creates a session, returns `sessionId`, `shareId`, `trackerToken`, `shareUrl`.
2. Browser calls `watchPosition`; for each GPS reading it sends `POST /api/sessions/:id/locations` (throttled, about once per 2 seconds).
3. The API **validates** and **publishes** a `LocationEvent` to Kafka topic `location.updates` with **key = sessionId**. It then replies `202 Accepted` immediately. It does **not** talk to viewers directly.
4. Two independent **consumer groups** read the same topic:
   - `location-broadcaster`: pushes the event to viewers over WebSocket.
   - `location-archiver`: appends the event to a file (history). This demonstrates **fan-out**: one message, many independent readers.
5. Viewer opens `/track/:shareId`, joins a WebSocket room `share:{shareId}`, receives the latest known location right away, then receives live updates.
6. Tracker clicks **Stop** → `POST /api/sessions/:id/stop` → backend marks the session ended and publishes a `SessionEvent` (`STOPPED`) to `session.events`; the broadcaster tells viewers.

### Why not send GPS straight to the WebSocket?

Because the learning goal is Kafka. Putting Kafka in the middle also gives real benefits: the API stays fast even if consumers are slow, consumers can crash and catch up later, and you can add new consumers (analytics, alerts) without touching the producer.

---

## 3. Kafka concepts mapped to this project

Read this section before reviewing the code.

| Concept | Meaning | In this project |
|---|---|---|
| **Broker** | A Kafka server | One broker in Docker (KRaft mode, no ZooKeeper) |
| **Topic** | A named, append-only log of messages | `location.updates`, `session.events` |
| **Partition** | A topic is split into ordered lanes | `location.updates` has **3 partitions** |
| **Message key** | Decides which partition a message goes to (hash of key) | `key = sessionId`, so all points of one trip go to the **same partition** and stay in **order** |
| **Offset** | Position of a message inside a partition | Consumers remember it, so they resume after a restart |
| **Producer** | Writes messages | `KafkaService.publish()` in the API |
| **Consumer** | Reads messages | broadcaster and archiver |
| **Consumer group** | A team of consumers sharing the work; each partition is read by **one** member of the group | Two groups = two independent copies of the stream |
| **Lag** | How far a group is behind the latest offset | You will inspect it with the CLI |
| **Retention** | How long Kafka keeps messages | Set to 1 hour for location data |

### Key rules to remember

- **Ordering is guaranteed only within a partition.** That is why we use `sessionId` as the key.
- **Different consumer groups** each get **every** message. **Members of the same group** split the messages between them.
- A consumer group can have at most as many *active* consumers as partitions (3 here).
- Kafka does not push; consumers **pull**. Offsets are committed after processing (at-least-once delivery). So handlers should tolerate duplicates (we include `eventId` and `seq` for this).

---

## 4. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | |
| Map | `leaflet` + `react-leaflet` + OpenStreetMap tiles | No API key needed |
| Realtime client | `socket.io-client` | |
| Backend | NestJS 10 + TypeScript | |
| Kafka client | `kafkajs` | Plain, well documented |
| Realtime server | `@nestjs/websockets` + `@nestjs/platform-socket.io` | |
| Validation | `class-validator`, `class-transformer` | |
| IDs | `nanoid` (shareId), `crypto.randomUUID()` (sessionId, eventId), `crypto.randomBytes(24)` (trackerToken) | |
| Kafka broker | `apache/kafka:3.8.0` in Docker (KRaft) | |
| Optional | `ioredis`, `amqplib`, Redis and RabbitMQ in Docker | |

---

## 5. Backend design (NestJS)

### 5.1 Folder structure

```
backend/
  src/
    main.ts
    app.module.ts
    config/
      configuration.ts          # reads env vars
    kafka/
      kafka.module.ts
      kafka.constants.ts        # topic names, group ids
      kafka.service.ts          # producer + generic subscribe()
    events/
      location-event.ts         # TypeScript interfaces for Kafka messages
    sessions/
      sessions.module.ts
      sessions.controller.ts
      sessions.service.ts
      session.store.ts          # interface + MemorySessionStore
      dto/
    locations/
      locations.module.ts
      locations.controller.ts
      locations.service.ts      # validate, then publish to Kafka
      dto/send-location.dto.ts
    consumers/
      consumers.module.ts
      broadcaster.consumer.ts   # group: location-broadcaster
      archiver.consumer.ts      # group: location-archiver
    gateway/
      live.gateway.ts           # Socket.IO
    optional/                   # built later
      redis/
      rabbitmq/
  data/                         # history.jsonl is written here (gitignored)
  .env.example
```

### 5.2 Kafka topics

| Topic | Partitions | Key | Value | Retention |
|---|---|---|---|---|
| `location.updates` | 3 | `sessionId` | `LocationEvent` JSON | 1 hour |
| `session.events` | 1 | `sessionId` | `SessionEvent` JSON | 1 day |

Topics are created on app startup by `KafkaService.ensureTopics()` using the kafkajs **admin** client (idempotent: skip if they already exist).

### 5.3 Why `kafkajs` directly and not `@nestjs/microservices`?

The Nest Kafka transport is convenient, but it hides things you want to learn, and a hybrid app with two consumer groups is awkward: every `@EventPattern` handler gets registered to every microservice connection. Using `kafkajs` inside normal providers makes producer, consumer groups, offsets and partitions explicit and easy to inspect. (After finishing, an optional exercise is to re-do the broadcaster with `@nestjs/microservices`.)

### 5.4 Message schemas (`events/location-event.ts`)

```ts
export interface LocationEvent {
  eventId: string;        // uuid, for deduplication
  sessionId: string;
  shareId: string;        // lets the broadcaster pick the WebSocket room
  seq: number;            // increments per session, set by the client
  lat: number;            // -90..90
  lng: number;            // -180..180
  accuracy?: number;      // meters
  speed?: number;         // m/s
  heading?: number;       // degrees
  deviceTimestamp: number;// ms epoch from the phone
  receivedAt: number;     // ms epoch set by the API
}

export interface SessionEvent {
  eventId: string;
  type: 'STARTED' | 'STOPPED';
  sessionId: string;
  shareId: string;
  at: number;
}
```

### 5.5 REST API

Base path `/api`.

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/sessions` | none | none | `201 { sessionId, shareId, trackerToken, shareUrl }` |
| POST | `/sessions/:sessionId/locations` | header `x-tracker-token` | `{ seq, lat, lng, accuracy?, speed?, heading?, deviceTimestamp }` | `202 { accepted: true }` |
| POST | `/sessions/:sessionId/stop` | header `x-tracker-token` | none | `200 { status: 'ENDED' }` |
| GET | `/share/:shareId` | none (public) | none | `200 { status: 'ACTIVE'\|'ENDED', lastLocation: LocationEvent \| null }`, `404` if unknown |
| GET | `/health` | none | none | `200 { ok: true }` |

Rules:

- `trackerToken` is compared with `crypto.timingSafeEqual`. Wrong or missing token returns `401`.
- Posting a location to an `ENDED` session returns `409`.
- `lat`/`lng` out of range returns `400` (use `class-validator` `@IsLatitude()`, `@IsLongitude()`).
- Rate limit: reject more than ~1 location per 500 ms per session with `429` (simple in-memory timestamp check; Redis version is optional).
- **Never** expose `sessionId` or `trackerToken` to viewers. Viewers only know `shareId`.
- `shareId`: `nanoid(16)`. It is the only thing in the public URL.

### 5.6 WebSocket (Socket.IO, namespace `/live`)

| Direction | Event | Payload |
|---|---|---|
| client → server | `join` | `shareId` (string). Server acks with `{ status, lastLocation }` snapshot |
| server → client | `location` | `{ lat, lng, accuracy, speed, heading, seq, deviceTimestamp }` (no sessionId) |
| server → client | `session:ended` | `{ endedAt }` |

Viewers join room `share:{shareId}`. The broadcaster consumer emits to that room. Unknown `shareId` on join returns an error ack.

### 5.7 Session store

Define an interface so Redis can be swapped in later:

```ts
export interface SessionStore {
  create(s: Session): Promise<void>;
  getById(sessionId: string): Promise<Session | null>;
  getByShareId(shareId: string): Promise<Session | null>;
  end(sessionId: string): Promise<void>;
  setLastLocation(sessionId: string, loc: LocationEvent): Promise<void>;
  getLastLocation(sessionId: string): Promise<LocationEvent | null>;
}
```

Default implementation `MemorySessionStore` uses `Map`s. Sessions are lost on restart, which is fine for learning. Add a cleanup `setInterval` removing sessions older than 12 hours.

### 5.8 Kafka service (core of the learning)

```ts
// kafka/kafka.service.ts  (simplified skeleton)
import { Kafka, Consumer, Producer, logLevel } from 'kafkajs';

@Injectable()
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly kafka = new Kafka({
    clientId: 'live-tracker',
    brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
    logLevel: logLevel.WARN,
  });
  private producer: Producer = this.kafka.producer({
    idempotent: true,          // no duplicates on producer retries
    maxInFlightRequests: 1,    // required for strict ordering with retries
  });
  private consumers: Consumer[] = [];

  async onModuleInit() {
    await this.ensureTopics();     // admin: create topics if missing
    await this.producer.connect();
  }

  // Publish one message. The key decides the partition.
  async publish(topic: string, key: string, value: object) {
    await this.producer.send({
      topic,
      acks: -1,                    // wait for all in-sync replicas
      messages: [{ key, value: JSON.stringify(value) }],
    });
  }

  // Start a consumer in a group. Same groupId = share work. Different = own copy.
  async subscribe<T>(groupId: string, topic: string, handler: (v: T) => Promise<void>) {
    const consumer = this.kafka.consumer({ groupId });
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ message, partition }) => {
        if (!message.value) return;
        try {
          await handler(JSON.parse(message.value.toString()));
        } catch (err) {
          // Log and continue. Do not crash the consumer on a bad message.
          console.error(`[${groupId}] p${partition} failed`, err);
        }
      },
    });
    this.consumers.push(consumer);
  }

  async onModuleDestroy() {
    await Promise.all(this.consumers.map(c => c.disconnect()));
    await this.producer.disconnect();
  }
}
```

Notes the agent must add as comments:

- `ensureTopics` uses `admin.createTopics({ waitForLeaders: true, topics: [...] })` with `numPartitions` and `configEntries: [{ name: 'retention.ms', value: '3600000' }]`.
- `fromBeginning: false` means a **brand new** group starts at the end. Once a group has committed offsets, it resumes from them regardless.
- Set env `KAFKAJS_NO_PARTITIONER_WARNING=1` to silence the partitioner notice.

### 5.9 Locations service (producer side)

```ts
async ingest(sessionId: string, token: string, dto: SendLocationDto) {
  const session = await this.sessions.assertTracker(sessionId, token); // 401/404/409
  const event: LocationEvent = {
    eventId: randomUUID(),
    sessionId,
    shareId: session.shareId,
    ...dto,
    receivedAt: Date.now(),
  };
  await this.sessions.setLastLocation(sessionId, event); // so new viewers get a snapshot
  await this.kafka.publish(TOPICS.LOCATION_UPDATES, sessionId, event);
}
```

### 5.10 Consumers

**Broadcaster** (`group: location-broadcaster`):

```ts
async onModuleInit() {
  await this.kafka.subscribe<LocationEvent>(GROUPS.BROADCASTER, TOPICS.LOCATION_UPDATES, async (e) => {
    this.gateway.emitLocation(e.shareId, {
      lat: e.lat, lng: e.lng, accuracy: e.accuracy, speed: e.speed,
      heading: e.heading, seq: e.seq, deviceTimestamp: e.deviceTimestamp,
    });
  });
  await this.kafka.subscribe<SessionEvent>(GROUPS.BROADCASTER, TOPICS.SESSION_EVENTS, async (e) => {
    if (e.type === 'STOPPED') this.gateway.emitEnded(e.shareId, e.at);
  });
}
```

**Archiver** (`group: location-archiver`): appends one JSON line per `LocationEvent` to `data/history.jsonl` using `fs.promises.appendFile`. It exists to prove that a second group gets the same messages independently.

> **Scaling note (explain in README):** with several API instances, each broadcaster instance only has the WebSockets of *its own* viewers. In that case each instance needs **every** message, so use a **unique groupId per instance** (for example `location-broadcaster-${hostname}`), or add the Socket.IO Redis adapter. For this project run **one instance**.

### 5.11 `main.ts`

- `app.setGlobalPrefix('api')`
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`
- `app.enableCors({ origin: process.env.CORS_ORIGIN })`
- `app.enableShutdownHooks()` so Kafka disconnects cleanly
- Listen on `PORT` (default 3000)

### 5.12 Environment variables (`backend/.env.example`)

```
PORT=3000
CORS_ORIGIN=http://localhost:5173
PUBLIC_APP_URL=http://localhost:5173
KAFKA_BROKERS=localhost:9092
KAFKAJS_NO_PARTITIONER_WARNING=1

# Optional features (Phases 8 and 9)
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379
RABBITMQ_ENABLED=false
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

`shareUrl = ${PUBLIC_APP_URL}/track/${shareId}`.

---

## 6. Frontend design (React)

### 6.1 Folder structure

```
frontend/
  src/
    main.tsx
    App.tsx                  # react-router: "/" and "/track/:shareId"
    api.ts                   # fetch wrappers
    config.ts                # VITE_API_URL
    hooks/
      useTracker.ts          # geolocation + sending logic
      useLiveLocation.ts     # socket.io logic for viewers
    pages/
      TrackerPage.tsx
      ViewerPage.tsx
    components/
      LiveMap.tsx            # react-leaflet map + marker
      CopyLink.tsx
  .env.example               # VITE_API_URL=http://localhost:3000
```

### 6.2 Tracker page (`/`)

UI is intentionally tiny:

- A big **Start tracking** button. When active, it becomes **Stop tracking**.
- Status text: `Idle`, `Getting GPS permission…`, `Tracking (last sent 12:01:05, accuracy 8 m)`, `Error: …`.
- When active, show the **share link** with a **Copy** button.

`useTracker` logic:

```ts
async function start() {
  const s = await api.createSession();                  // sessionId, trackerToken, shareUrl
  sessionRef.current = s;
  seqRef.current = 0;
  watchIdRef.current = navigator.geolocation.watchPosition(
    (pos) => maybeSend(pos),
    (err) => setError(err.message),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
}

function maybeSend(pos: GeolocationPosition) {
  const now = Date.now();
  if (now - lastSentRef.current < 2000) return;         // throttle: 1 point / 2 s
  lastSentRef.current = now;
  api.sendLocation(sessionRef.current, {
    seq: ++seqRef.current,
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? undefined,
    speed: pos.coords.speed ?? undefined,
    heading: pos.coords.heading ?? undefined,
    deviceTimestamp: pos.timestamp,
  });
}

async function stop() {
  navigator.geolocation.clearWatch(watchIdRef.current!);
  await api.stopSession(sessionRef.current);
}
```

Also:

- Save `{sessionId, trackerToken, shareUrl}` to `sessionStorage` so a page refresh can resume (nice to have; call `start`'s watch part again without creating a new session).
- Call `stop()` best-effort on `beforeunload` is **not** required.
- Handle permission denied with a clear message.

### 6.3 Viewer page (`/track/:shareId`)

1. On mount: `GET /api/share/:shareId`. If 404, show "Link not found".
2. Connect `io(API_URL + '/live')`, emit `join` with `shareId`; the ack returns the snapshot (`lastLocation`), so the marker shows immediately.
3. On `location`: ignore if `seq` is lower than the last `seq` seen (drop out-of-order/duplicates), else move the marker and re-center the map smoothly.
4. On `session:ended`: show banner "Tracking ended" and keep the last position.
5. Show a small connection indicator (connected / reconnecting). On reconnect, emit `join` again.
6. Show "Waiting for first location…" if there is no location yet.

`LiveMap`: `react-leaflet` `MapContainer` + OSM `TileLayer` + `Marker` + optional `Circle` for accuracy. Draw a `Polyline` of points received during this visit (optional). Remember to import `leaflet/dist/leaflet.css` and fix the default marker icon import issue in Vite.

---

## 7. Local infrastructure

### 7.1 `docker-compose.yml` (repo root)

```yaml
services:
  kafka:
    image: apache/kafka:3.8.0
    container_name: kafka
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0

  # Optional (Phase 8)
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    profiles: ["redis"]

  # Optional (Phase 9)
  rabbitmq:
    image: rabbitmq:3-management
    ports: ["5672:5672", "15672:15672"]   # 15672 = management UI (guest/guest)
    profiles: ["rabbit"]
```

Run: `docker compose up -d` (core) or `docker compose --profile redis --profile rabbit up -d` (everything).

The backend runs on the host (`npm run start:dev`) and connects to `localhost:9092`, which is why the advertised listener is `localhost:9092`.

### 7.2 Useful Kafka CLI commands (run inside the container)

```bash
# list topics
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list

# describe a topic (partitions, leaders)
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --describe --topic location.updates

# watch messages live, showing keys and partitions
docker exec -it kafka /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 --topic location.updates \
  --property print.key=true --property print.partition=true

# consumer group state and LAG
docker exec -it kafka /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --describe --group location-broadcaster
```

### 7.3 Testing GPS on a phone

`navigator.geolocation` only works on **HTTPS** or **localhost**. To test from a real phone, expose the frontend and backend with a tunnel (for example `ngrok` or `cloudflared`) and set `VITE_API_URL`, `PUBLIC_APP_URL` and `CORS_ORIGIN` to the HTTPS URLs. For desktop testing, Chrome DevTools → Sensors lets you fake a location and change it.

---

## 8. Security and reliability checklist

- [ ] `shareId` is random (16 chars), unguessable; `sessionId` and `trackerToken` never reach viewers.
- [ ] `trackerToken` checked with timing-safe comparison.
- [ ] Input validated (lat/lng ranges, numeric types, body size limit).
- [ ] CORS restricted to the frontend origin.
- [ ] Sessions auto-expire after 12 h; location data in Kafka expires after 1 h.
- [ ] A bad Kafka message never crashes a consumer (try/catch, log, continue).
- [ ] Graceful shutdown disconnects producer and consumers.
- [ ] Viewer drops out-of-order points using `seq`.
- [ ] README warns: location data is sensitive; real products need consent, HTTPS, auth and a privacy policy.

---

## 9. Implementation phases (with acceptance checks)

### Phase 1: Repo and infrastructure
- Create `live-tracker/` with `backend/` (`nest new backend`) and `frontend/` (`npm create vite@latest frontend -- --template react-ts`).
- Add `docker-compose.yml`, `.gitignore` (include `data/`, `.env`), `README.md`, `DECISIONS.md`.
- **Check:** `docker compose up -d` runs, and `kafka-topics.sh --list` works without error.

### Phase 2: Backend skeleton + sessions
- Install: `kafkajs @nestjs/websockets @nestjs/platform-socket.io socket.io class-validator class-transformer nanoid@3 @nestjs/config`. (Use `nanoid@3` because v4+ is ESM-only and conflicts with Nest's CommonJS default.)
- Implement `SessionStore` (memory), `SessionsService`, `SessionsController`, `/health`, global validation, CORS.
- **Check:** with `curl`, `POST /api/sessions` returns the 4 fields; `GET /api/share/<shareId>` returns `ACTIVE` and `lastLocation: null`.

### Phase 3: Kafka producer + topics
- Implement `KafkaModule`, `KafkaService` (`ensureTopics`, `publish`).
- Implement `LocationsController/Service` (validation, auth, publish) and the stop endpoint (publishes `STOPPED`).
- **Check:** run the console consumer from 7.2, then `curl` a location; the message appears with a key equal to the `sessionId`. Sending 10 points with the same session always shows the **same partition**.

### Phase 4: Consumers + WebSocket gateway
- Implement `LiveGateway` (`join`, `emitLocation`, `emitEnded`).
- Implement `BroadcasterConsumer` and `ArchiverConsumer`.
- **Check:** `data/history.jsonl` grows when you post locations. A quick Socket.IO test script (or Postman WebSocket) joined to the share room receives `location` events. `kafka-consumer-groups.sh --describe` shows both groups with `LAG 0`.

### Phase 5: Frontend viewer
- Routing, `ViewerPage`, `useLiveLocation`, `LiveMap`.
- **Check:** open `/track/<shareId>`; posting locations with `curl` moves the marker live; stop shows "Tracking ended".

### Phase 6: Frontend tracker
- `TrackerPage`, `useTracker`, `CopyLink`, `api.ts`.
- **Check:** Start in one tab, open the share link in another tab; use DevTools Sensors to change the location; the viewer updates within ~2-3 seconds. Stop works.

### Phase 7: Hardening + learning experiments
- Rate limit, session cleanup, error states, reconnect handling, README with run instructions and diagram.
- Do the experiments in **Section 10** and write observations in `LEARNINGS.md`.
- **Check:** every item in Section 8 is ticked.

### Phase 8 (optional): Redis
Flag: `REDIS_ENABLED=true`. Install `ioredis`.
1. `RedisSessionStore` implementing `SessionStore`:
   - `session:{sessionId}` → JSON, TTL 12 h
   - `share:{shareId}` → `sessionId`, TTL 12 h
   - `loc:last:{sessionId}` → last `LocationEvent`, TTL 1 h
2. Rate limiting with `INCR rl:{sessionId}` + `PEXPIRE 500` instead of in-memory timestamps.
3. (Stretch) Socket.IO Redis adapter (`@socket.io/redis-adapter`) so several API instances share rooms.
- Choose the store in `SessionsModule` with a provider factory based on the flag.
- **Check:** restart the backend; an existing share link still returns its last location.

### Phase 9 (optional): RabbitMQ
Flag: `RABBITMQ_ENABLED=true`. Install `amqplib`.
- Purpose: show **Kafka vs RabbitMQ**. Use RabbitMQ for a **task** ("do this job once, with retries"), not for the location stream.
- When a session starts, publish a job `notify.session_started` to queue `notifications` (durable, via the default exchange).
- A `NotificationWorker` consumes the queue, simulates "send notification" (log + 1 s delay), and `ack`s. On failure, `nack` to a **dead-letter queue** `notifications.dlq` after 3 attempts.
- **Check:** RabbitMQ UI (`localhost:15672`) shows messages flowing; kill the worker mid-job to watch the message get redelivered.

---

## 10. Learning experiments (do these to really understand Kafka)

| # | Experiment | What you will learn |
|---|---|---|
| 1 | Post points for 3 different sessions, then describe topic and console-consume with `print.partition=true` | Same key → same partition; different keys spread out |
| 2 | Stop the backend, post nothing, restart. Compare with the group offsets | Offsets are committed, consumers resume where they left off |
| 3 | Temporarily make the archiver throw/sleep 5 s per message, and watch `LAG` | Slow consumers lag **without** slowing the producer or the broadcaster |
| 4 | Start a **second** backend instance (`PORT=3001`) with the same group ids | Same group → partitions are split (rebalance); watch `--describe --group` |
| 5 | Start a third group (a tiny script that logs messages) | Another independent copy of the stream |
| 6 | Change `acks` to `0`/`1` and discuss durability vs speed | Producer acknowledgements |
| 7 | Change the key to a constant string, and observe all points go to one partition | Why key choice matters (hot partition) |
| 8 | Reset a group's offsets: `kafka-consumer-groups.sh --reset-offsets --to-earliest --execute --group location-archiver --topic location.updates` | Replaying history |
| 9 | Add `location.updates.dlq` and send unparsable messages there | Dead-letter pattern |
| 10 | (Stretch) Add a third consumer that detects "stopped moving for 5 min" | Stream processing idea |

---

## 11. Definition of done

- [ ] `docker compose up -d` + `npm run start:dev` (backend) + `npm run dev` (frontend) gives a working app.
- [ ] Start → link appears → viewer sees live moving marker → Stop → viewer sees "Tracking ended".
- [ ] Two consumer groups visible in `kafka-consumer-groups.sh --list`, both with low lag.
- [ ] `history.jsonl` contains the points of the trip.
- [ ] README explains how to run, the architecture diagram, and the single-instance limitation.
- [ ] `LEARNINGS.md` has notes from at least experiments 1, 2, 3 and 4.
- [ ] (Optional) Redis and RabbitMQ phases work behind their flags, and the app still works with both flags off.

---

## 12. Common pitfalls (for the agent and for you)

| Problem | Cause / fix |
|---|---|
| `KafkaJSConnectionError` on startup | Broker not ready or wrong advertised listener. Wait a few seconds; make sure `KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092` when the app runs on the host |
| Consumer receives nothing | New group with `fromBeginning: false` started **after** the messages were sent; send new points, or reset offsets |
| `nanoid` import error in Nest | Use `nanoid@3` (CommonJS) |
| Points arrive out of order | Key must be `sessionId`; the viewer should also use `seq` |
| Geolocation blocked | Needs HTTPS or localhost; user must allow permission |
| Marker icon missing in Leaflet + Vite | Import marker images explicitly and call `L.Icon.Default.mergeOptions` |
| CORS error from WebSocket | Set `cors.origin` in `@WebSocketGateway` as well as `enableCors` |
| Duplicate points | At-least-once delivery; dedupe by `eventId`/`seq` in the viewer |
| Mobile browser stops sending when screen is off | Browser limitation; mention in README (a Wake Lock API is an optional improvement) |

---

## 13. Glossary

- **Event**: a fact that happened ("device at lat/lng at time T"). Kafka stores events.
- **Fan-out**: one message delivered to many independent consumers (different groups).
- **At-least-once**: a message may be delivered more than once, never silently lost.
- **Rebalance**: Kafka reassigning partitions when group members join or leave.
- **KRaft**: Kafka's built-in metadata management that replaces ZooKeeper.
- **Dead-letter queue (DLQ)**: a place for messages that repeatedly fail processing.
