# DECISIONS.md

Decisions made while implementing `live-gps-tracker-plan.md`. The plan says:
"If something is ambiguous, pick the simplest option, and write the decision here."

1. **`backend/` and `frontend/` live at the repo root**, not inside a nested
   `live-tracker/` folder — the git repository (`kafka-live-tracker`) already
   is the project, so a nested wrapper folder would only add noise.

2. **Node 16 compatibility.** The machine runs Node 16, so the frontend uses
   **Vite 4** (Vite 5+ requires Node 18). Backend is NestJS 10 (Node 16 OK).

3. **`nanoid@3`** (CommonJS) as the plan specifies; v4+ is ESM-only and breaks
   Nest's default CommonJS build.

4. **RabbitMQ compose port typo** in the plan's snippet (`"5672:5679"`) was
   corrected to `"5672:5672"`. RabbitMQ itself is still optional/off by default.

5. **RabbitMQ/Redis (Phases 8–9) scaffolding removed.** Initially the compose
   file and env carried flag placeholders for optional Redis/RabbitMQ services.
   Neither is used by the core build, so the placeholder services, env lines
   and docker profiles were deleted to keep the stack lean. The plan document
   keeps the full Phase 8/9 designs; re-add `ioredis`/`amqplib` and the compose
   entries when implementing them. The `SessionStore` interface remains, so a
   Redis implementation can still be dropped in without code changes elsewhere.

6. **Unused dev tooling removed from `backend/`.** The eslint/prettier toolchain
   had no config files, and `ts-node`, `@types/express`, `@types/socket.io`
   were unreferenced (nest watch runs plain `node dist/main`). `npm run check`
   (`tsc --noEmit`) is the type gate; `npm run test:socket` runs the Socket.IO
   probe script. Running the app is the "lint" here — build errors surface on
   every file change.
