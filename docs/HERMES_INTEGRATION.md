Hermes Integration - Compatibility Guide

Goal
- Keep existing Hermes-style task assignment flows working while durable SQLite storage backs the data.

HTTP compatibility surface
- `POST /api/hermes/assign`
  - Accepts flexible Hermes-like payloads.
  - Normalizes the payload into a pending durable task record.
  - Returns `{ ok: true, task }`.
- `POST /api/hermes/delete`
  - Removes a pending Hermes task by `taskId`.
- `POST /api/memory/get`
  - Body: `{ key?: string }`
  - `key: "hermes_tasks"` returns pending Hermes tasks from durable storage.
- `POST /api/memory/set`
  - Body: `{ key: string, value: any }`
  - Preserves legacy behavior, including direct writes to `hermes_tasks`.

Durable behavior
- Hermes tasks are stored in SQLite, not only in `memories.json`.
- Accepted Hermes tasks transition out of the pending queue and into the agent's active task list.
- Rejected Hermes tasks are durably removed and do not reappear after restart.

Desktop parity
- Tauri exposes matching commands:
  - `hermes_assign`
  - `hermes_delete`
  - `memory_get`
  - `memory_set`

Payload mapping
- The compatibility layer accepts the common Hermes field variants already used by the project:
  - `taskId`, `id`, `task.id`
  - `title`, `summary`
  - `instructions`, `description`
  - `assignee`, `targetAgent`
  - `eta`, `etaMinutes`
  - `metadata`, `meta`

Migration note
- If a legacy `memories.json` file already contains `hermes_tasks`, they are imported into the durable store on first startup and tracked through migration metadata.
