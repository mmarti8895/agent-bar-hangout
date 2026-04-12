# Tauri Persistence Contract

The standalone desktop build must expose the same persistence behavior as the web/dev-server
runtime without requiring a local Node server.

## Command Surface

### `persistence_bootstrap()`

**Returns**:

- `agents`: array of `{ agentId, tasks, history }`
- `hermesTasks`: pending Hermes tasks
- `migration`: optional migration/import summary

### `persistence_task_upsert(task)`

**Input**:

- `task`: durable task payload matching the HTTP `PersistedTask` schema

**Returns**:

- `{ ok: true, task }`

### `persistence_task_transition(taskId, status, agentId?, completedAt?)`

**Input**:

- `taskId`: task identifier
- `status`: `pending | in_progress | done | rejected`
- `agentId`: optional assigned agent
- `completedAt`: optional completion timestamp for `done`

**Returns**:

- `{ ok: true, task }`

### `persistence_task_delete(taskId)`

**Input**:

- `taskId`: task identifier

**Returns**:

- `{ ok: true, removed: number }`

### Memory compatibility commands

The Tauri backend also mirrors the web memory/Hermes compatibility surface:

- `memory_get(key?)`
- `memory_set(key, value)`
- `memory_keys()`
- `memory_delete(key)`
- `memory_clear()`
- `hermes_assign(payload)`
- `hermes_delete(taskId)`

## Behavioral Parity Requirements

- Generic memory semantics must match the existing HTTP behavior.
- Pending Hermes tasks must remain readable through compatibility paths.
- Bootstrap, upsert, and transition results must preserve the same task shape as the web runtime so
  `app.js` can share one renderer-side persistence gateway.
- Failures must return actionable messages and must not claim durable success on a failed write.
