# Data Model: Durable Task Memory

## MemoryEntry

**Purpose**: Stores generic durable application memory by key.

**Fields**:

- `key` (string, primary key): Stable memory identifier. Existing compatibility keys such as
  `hermes_tasks` remain reserved.
- `value_json` (JSON/text): Persisted value payload.
- `updated_at` (timestamp): Last successful write time.

**Validation Rules**:

- `key` must be a non-empty string with a maximum length of 256 characters.
- Serialized `value_json` must remain within the current 200 KB request-size expectation unless a
  later contract change explicitly revises that limit.

## PersistedTask

**Purpose**: Represents any task that must survive restart, including pending Hermes tasks, active
manual tasks, and completed task history.

**Fields**:

- `id` (string, primary key): Task identifier. Hermes-provided IDs remain stable when present.
- `source` (enum): `manual` or `hermes`.
- `agent_id` (string, nullable): Assigned agent for active/completed tasks. `null` for pending
  Hermes items not yet accepted.
- `title` (string): User-visible task title.
- `instructions` (string): Task details shown in UI and Hermes panel.
- `eta_minutes` (integer, nullable): Optional estimated duration.
- `mcp_ids` (JSON array): Associated MCP adapter IDs for manual tasks.
- `metadata_json` (JSON object): Arbitrary Hermes or workflow metadata.
- `status` (enum): `pending`, `in_progress`, `done`, or `rejected`.
- `created_at` (timestamp): Initial task creation time.
- `updated_at` (timestamp): Last durable state transition time.
- `received_at` (timestamp, nullable): When a Hermes task arrived.
- `completed_at` (timestamp, nullable): When a task completed successfully.

**Validation Rules**:

- `status` must align with the workflow path below.
- `completed_at` is required when `status = done`.
- `agent_id` is required for `in_progress` and `done` tasks.
- `mcp_ids` defaults to `[]` for Hermes tasks unless enriched later.

**State Transitions**:

- `pending` -> `in_progress` when a Hermes task is accepted
- `pending` -> `rejected` when a Hermes task is rejected
- `in_progress` -> `done` when a task completes
- `in_progress` -> `rejected` only if the UI later adds explicit cancellation semantics
- Manual tasks begin at `in_progress`

## MigrationRecord

**Purpose**: Tracks idempotent preservation/import of file-backed state.

**Fields**:

- `migration_key` (string, primary key): Logical migration identifier such as `memories_json_v1`.
- `source_path` (string): Imported file path.
- `source_hash` (string, nullable): Optional fingerprint of imported contents for replay safety.
- `status` (enum): `pending`, `completed`, or `failed`.
- `started_at` (timestamp): Import start time.
- `completed_at` (timestamp, nullable): Import completion time.
- `details_json` (JSON object, nullable): Summary counts, warnings, or failure details.

**Validation Rules**:

- A `completed` migration for the same `migration_key` must make future imports no-op unless the
  source is intentionally reprocessed.
- Failed migrations must retain enough detail to support recovery and test assertions.

## Derived Views

These views are computed from durable records rather than stored as separate entities:

- **Hermes Queue View**: `PersistedTask` rows where `source = hermes` and `status = pending`
- **Active Agent Tasks View**: `PersistedTask` rows where `status = in_progress`, grouped by
  `agent_id`
- **Agent History View**: `PersistedTask` rows where `status = done`, grouped by `agent_id` and
  ordered by `completed_at DESC`
