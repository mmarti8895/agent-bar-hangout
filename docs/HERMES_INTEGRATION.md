Hermes Integration — Compatibility Guide

Goal
- Provide compatibility with "Hermes"-style agent/task messaging so external systems can assign tasks to Agent Bar Hangout via a stable HTTP API.

Server endpoints added
- POST /api/hermes/assign
  - Accepts a flexible Hermes-like payload and normalizes into an internal task object.
  - Persists tasks to `memories.json` under `hermes_tasks` for later processing.
  - Returns { ok: true, task }

- POST /api/memory/get
  - Body: { key?: string }
  - If `key` omitted, returns full store; otherwise returns { value }

- POST /api/memory/set
  - Body: { key: string, value: any }
  - Saves value under key in `memories.json`.

Design notes
- Memory persistence: simple JSON file (`memories.json`) stored next to `server.js`. This is intentionally minimal for local/dev usage. For production use, swap to a proper DB (SQLite/Postgres) or key-value store.
- Hermes mapping: the endpoint is conservative and accepts several common field names (`taskId`, `id`, `task.id`, `title`, `summary`, `instructions`, `description`, `assignee`, `targetAgent`, `eta`, `etaMinutes`, `metadata`). It creates a normalized `task` with `receivedAt` timestamp.
- Security: endpoints are unauthenticated (dev server). If exposing publicly, add auth and input validation.

Client integration
- The client UI can poll `/api/memory/get` or read `hermes_tasks` to show incoming Hermes-assigned tasks, and then call existing task assignment workflows.
- For Tauri/desktop mode, the same server endpoints are available locally when the dev server runs.

Next steps
1. Wire client-side UI to consume `hermes_tasks` and allow accepting/rejecting tasks.
2. Add unit tests covering normalization and memory persistence.
3. Replace file-backed memory with a database if long-term persistence or concurrency is required.
