# @starbeam/worker

Starbeam background jobs runner (Node + TypeScript) using Graphile Worker with Postgres as the queue.

Responsibilities:

- Connector polling (incremental sync without pulse generation)
- Daily pulse scheduling (user-local time windows)
- Nightly workspace runs (sync + pulse generation)
- Blob GC (hosted object store cleanup)

## Local Development

From the repo root:

```bash
# Start local infra (Postgres + MinIO)
docker compose up -d

# Run DB migrations once
pnpm --filter @starbeam/db prisma:migrate

# Run the worker (watch mode)
pnpm --filter @starbeam/worker dev
```

Environment variables live at the repo root (see `/.env.example`).

Minimum env vars:

- `DATABASE_URL`

Common additions:

- `OPENAI_API_KEY` (enables OpenAI-backed research/synthesis)
- `STARB_CODEX_EXEC_ENABLED=1` (optional; enables `codex exec` in the worker runtime)
- Blob store (required when Codex exec is enabled in production):
  - `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`

## Scheduled Tasks (Crontab)

Schedules are defined in code (`src/index.ts`), not in a checked-in crontab file.

Notable tasks:

- `connector_poll` (tick every 5m; respects `STARB_CONNECTOR_POLL_INTERVAL_MINS`)
- `enqueue_due_daily_pulses` (tick every 15m; enqueues user/day jobs within the configured window)
- `nightly_workspace_run` (job executed per user/workspace/day)
- `blob_gc` (daily; deletes blob objects after a grace period once `deletedAt` is set)
