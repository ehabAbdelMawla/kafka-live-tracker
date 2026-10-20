# LEARNINGS.md — Kafka experiments on this codebase

All experiments were run on the running stack (single Kafka broker, one backend).

## 1. Same key → same partition

Posted 10 fixes for one session, then:

```bash
kafka-console-consumer.sh --topic location.updates --from-beginning \
  --property print.key=true --property print.partition=true
```

- Every message: `Partition:0  <sessionId>  {...}` — the key (hash) always maps the
  session to partition 0. **Ordering is per partition, which is why the key is
  `sessionId`: one trip = one ordered lane.**
- A second session's points appear on other partitions (messages exist on
  partitions 1 and 2 in the backlog) — different keys spread over the 3 lanes.

## 2. Offsets are committed; consumers resume after a restart

I restart the backend constantly while developing. Observations:

- Before restart, the archiver had committed offset 12 (with LAG 4 — see
  experiment 3). After restarting the app, the new group member **resumed at
  offset 12** and processed exactly the 4 lagging messages — nothing was
  re-processed, nothing was lost (at-least-once + committed offsets).
- `fromBeginning: false` only decides where a *brand new* group starts (the log
  end). Once offsets exist, they win.

## 3. Slow consumers lag without slowing others

Temporarily made the archiver `sleep 5s` per message, then posted 4 fixes:

```
location-broadcaster  p0 CURRENT 16  LOG-END 16  LAG 0     <- keeps pace
location-archiver     p0 CURRENT 12  LOG-END 16  LAG 4     <- falling behind
```

- The API still answered `202` immediately and the broadcaster still delivered
  live WebSocket updates: **the producer and other groups are untouched** by one
  slow group. That is the whole point of decoupling via the log.
- Interesting detail: the tracking arc is per *partition*. Only partition 0 had
  content in this run, so the lag shows there.

## 4. Two instances, same groupId → rebalance (and why we stay single-instance)

Started a second backend (`PORT=3001`) with identical code — same group ids:

```
GROUP                CONSUMER-ID   ASSIGNMENT
location-broadcaster live-tracker-…9-4f5c-98fd-1397e9cfff96    (0), (2)   <- instance 2
location-broadcaster live-tracker-…a095-455c-a634-16c36b8e5742 (0,1)      <- instance 1
location-archiver    live-tracker-…bd06239c-2303-4321-b961     (0,1)      <- instance 1
location-archiver    live-tracker-…a679795a-2794-49ba          (2)        <- instance 2
```

- The 3 partitions got **split between the two members** — that's the automatic
  rebalance when a member joins. Killing instance 2 splits them back.
- This exposes the scaling trap: with two API instances, each instance's Socket.IO
  gateway only knows *its own* viewers, but each instance now only *helps itself* to
  half the stream. A viewer connected to instance 1 silently misses fixes that
  landed on instance 2's partitions. Fixes: unique groupId per instance (each gets
  the full stream, nested fan-out) + Socket.IO Redis adapter (share rooms), or — as
  here — **just run one instance** for the learning build.

## 5. Consumer instance ≠ consumer *subscription* (kafkajs gotcha)

My first broadcaster bug: I created **two kafkajs `Consumer` objects with the same
groupId**, one subscribing `location.updates`, the other `session.events`.

- Symptom: locations flowed live, but `session:ended` never reached viewers;
  `kafka-consumer-groups.sh --describe` showed **no member assigned to
  `session.events`**.
- Cause: kafkajs's built-in `RoundRobinAssigner` computes assignments using the
  *leader member's* subscription list (`runner.js` passes `topics: topicsSubscribed`,
  the leader's own topics) and then **drops any assignment a member is not
  subscribed to** (`topicsNotSubscribed` guard). Members with a different topic
  sub-list end up receiving nothing for their own topic.
- Fix: one consumer object per group, subscribed to **all its topics before
  `run()`** (this is also what the plan's data flow implies: a group is a team on a
  *stream*, not a router). Lesson: when debugging consumers, start at
  `--describe --group <id>` and check which member is actually assigned which
  topic/partition.

## 6. Misc small learnings

- `await consumer.run(...)` never resolves until disconnect — awaiting it blocks
  everything after it in `onModuleInit`. Fire it and let shutdown hooks `disconnect()`.
- kafkajs is verbose at `INFO`: "group is rebalancing, re-joining" during startup is
  normal when members join/leave, not an error.
- Rebalancing during development restarts causes "rejoin is needed" bursts; the
  group recovers itself, which is part of the protocol working as designed.
