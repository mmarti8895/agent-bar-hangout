# Persistence Guide

Agent Bar Hangout now uses a local SQLite database for durable task history and memory in both runtimes:

- Web/dev server: `better-sqlite3`
- Tauri desktop: `rusqlite` with bundled SQLite

## What Is Stored

- Generic memory entries from `/api/memory/*`
- Pending Hermes assignments
- Active tasks
- Completed task history
- Migration metadata for one-time legacy imports

## Database Shape

- `memory_entries`
  - `key TEXT PRIMARY KEY`
  - `value_json TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
- `tasks`
  - `id TEXT PRIMARY KEY`
  - `source TEXT NOT NULL`
  - `agent_id TEXT`
  - `title TEXT NOT NULL`
  - `instructions TEXT NOT NULL`
  - `eta_minutes INTEGER`
  - `mcp_ids_json TEXT NOT NULL`
  - `metadata_json TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `created_at TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
  - `received_at TEXT`
  - `completed_at TEXT`
- `migration_records`
  - Tracks import status for legacy `memories.json`

## Compatibility

- `/api/memory/*` semantics remain available for existing integrations.
- `/api/hermes/assign` and `/api/hermes/delete` still work.
- Pending Hermes tasks are still exposed through the compatibility key `hermes_tasks`.
- New state endpoints power UI bootstrap and durable task transitions:
  - `POST /api/state/bootstrap`
  - `POST /api/state/task/upsert`
  - `POST /api/state/task/transition`
  - `POST /api/state/task/delete`

The Tauri runtime mirrors the same behavior through invoke commands:

- `persistence_bootstrap`
- `persistence_task_upsert`
- `persistence_task_transition`
- `persistence_task_delete`
- `memory_get`
- `memory_set`
- `memory_keys`
- `memory_delete`
- `memory_clear`
- `hermes_assign`
- `hermes_delete`

## Legacy Import

On first startup, the persistence layer checks for `memories.json` and imports:

- regular keys into `memory_entries`
- `hermes_tasks` into pending durable task records

Import status is recorded in `migration_records`. If import fails, the failure is recorded and the app continues using the database so users still get actionable errors instead of a hard startup crash.

## Test Notes

- `npm run coverage:unit` exercises the server endpoints plus direct SQLite persistence tests.
- `cargo test --manifest-path src-tauri/Cargo.toml` covers the desktop persistence module.
- Browser reload behavior is verified with Playwright using an isolated temp database.
