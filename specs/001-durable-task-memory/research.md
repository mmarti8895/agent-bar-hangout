# Research: Durable Task Memory

## Decision 1: Use SQLite as the durable store for both runtimes

**Decision**: Adopt SQLite as the durable source of truth for persisted memory and task records.
Use one local SQLite database file per runtime profile and migrate existing `memories.json` data
into that database on first successful startup.

**Rationale**: The feature must support both the Node/web runtime and the standalone Tauri
runtime, survive restarts, and remain local-first. SQLite provides durable, transactional storage
without introducing a separate network service. It also matches the repo’s existing guidance in
`PERSISTENCE.md` and the README’s recommendation to move beyond file-backed JSON for production-ish
durability.

**Alternatives considered**:

- Keep `memories.json`: rejected because writes can be overwritten across concurrent processes and
  it does not model task history or migration safely.
- PostgreSQL or another managed DB: rejected for the initial release because it adds infra and
  setup burden for a single-user local product.
- `sql.js`: rejected because it avoids native Node dependencies but would force a separate
  durability/file-management strategy from Tauri and complicate shared behavior.

## Decision 2: Use runtime-specific persistence adapters behind a shared frontend gateway

**Decision**: Implement a shared persistence gateway in the frontend that routes to:

- Node/dev-server HTTP endpoints in web mode
- Tauri invoke commands in desktop mode

Both adapters use the same logical persistence contract and the same SQLite schema.

**Rationale**: The frontend already branches between `fetch(...)` and `tauriInvoke(...)` for other
capabilities. Reusing that pattern keeps UI behavior aligned while allowing each runtime to use the
storage mechanism best suited to it.

**Alternatives considered**:

- Force the desktop app to depend on the Node dev server: rejected because the README explicitly
  states the Tauri build runs standalone.
- Put all persistence in browser-local storage: rejected because the feature needs durable task
  history and Hermes compatibility beyond ephemeral/localStorage behavior.

## Decision 3: Normalize Hermes tasks, active tasks, and completed history into one task table

**Decision**: Persist all task records in a single durable `tasks` table and distinguish views with
status/source fields instead of separate storage silos. Keep generic app memory in a separate
`memory_entries` table. Retain `hermes_tasks` compatibility by projecting pending Hermes tasks back
through the existing memory/Hermes API behavior.

**Rationale**: The current UI already models active tasks and completed history with the same task
shape, and Hermes tasks are a pending variant of the same workflow. A normalized task table makes
restore, history queries, and migration simpler while avoiding double-writes.

**Alternatives considered**:

- Store each agent snapshot as an opaque JSON blob: rejected because it makes targeted updates,
  migration, and task-state transitions harder to validate.
- Separate tables for Hermes queue, active tasks, and history: rejected because it duplicates task
  shape and complicates lifecycle transitions.

## Decision 4: Make migration idempotent and ledger-backed

**Decision**: Perform a one-time import from `memories.json` into SQLite using migration metadata
that records whether the file has already been processed. Treat migration as idempotent so restart
or partial failure does not duplicate imported data.

**Rationale**: The spec requires preserving file-backed state and not claiming durable success
unless the write actually completed. A ledger-backed migration is safer than a one-shot manual
script and supports automated testing.

**Alternatives considered**:

- Manual migration only: rejected because it makes rollout brittle and does not help existing local
  users automatically preserve data.
- Delete or overwrite the JSON file after import: rejected for the initial rollout because it
  increases recovery risk if import verification fails.

## Decision 5: Extend test and build support together

**Decision**: Treat SQLite support as a build-and-test change, not just a persistence change.
Extend:

- Node unit coverage to include repository logic, migration, and persistence-backed endpoints
- Playwright tests to verify restart recovery and Hermes compatibility
- Rust `cargo test` coverage for the Tauri persistence module
- CI/build scripts and docs to account for SQLite/native dependency support where required

**Rationale**: The user explicitly asked for build support to be extended as needed and for the
feature to be well tested. The current CI validates web behavior only, so the plan must add
desktop/runtime checks rather than relying on manual Tauri validation.

**Alternatives considered**:

- Keep existing Node-only tests: rejected because the Tauri runtime would remain unverified.
- Manual desktop smoke testing only: rejected because it does not satisfy the repo’s testing bar
  or the constitution’s changed-code coverage requirement.
