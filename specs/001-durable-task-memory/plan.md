# Implementation Plan: Durable Task Memory

**Branch**: `[001-durable-task-memory]` | **Date**: 2026-04-11 | **Spec**: [spec.md](./spec.md)  
**Input**: Feature specification from `/specs/001-durable-task-memory/spec.md`

**Note**: This plan covers durable persistence for both the web/dev-server runtime and the
standalone Tauri runtime while preserving current Hermes-compatible behavior.

## Summary

Replace the dev-only `memories.json` store with a durable SQLite-backed persistence layer that
supports both the Node-powered web flow and the standalone Tauri desktop flow. Keep the existing
Hermes-compatible memory behavior available, add runtime-specific persistence adapters behind a
shared frontend gateway, and persist manual task state/history so the application restores active,
completed, and pending work after restart. Extend build and CI support as needed for SQLite-backed
runtime code, and verify the change with exhaustive unit coverage, targeted Playwright recovery
tests, and Rust persistence tests.

## Technical Context

**Language/Version**: JavaScript (ES modules on Node 18+/browser) + Rust 2021 for Tauri  
**Primary Dependencies**: Tauri 2, Playwright, c8, existing Node HTTP server, add
`better-sqlite3` for the Node/dev-server runtime and `rusqlite` with bundled SQLite for the Tauri
runtime  
**Storage**: Local SQLite database file with tables for generic memory entries, persisted tasks,
and migration metadata; one-time import from `memories.json` when present  
**Testing**: `npm run coverage:unit`, targeted Playwright suites, `cargo test` for Tauri
persistence module, and runtime/build smoke validation for web and Tauri flows  
**Target Platform**: Browser + local Node dev server, plus Tauri desktop builds on Windows,
macOS, and Linux  
**Project Type**: Web application + desktop application  
**Performance Goals**: Single-record persistence reads/writes remain effectively instant for local
use (target <100 ms typical), and startup rehydration completes within 1 second for normal local
datasets (up to roughly 1,000 persisted tasks + memory records)  
**Constraints**: Preserve `/api/memory/*` and `/api/hermes/*` compatibility during rollout; Tauri
must work without a Node server; migration must be idempotent; changed code requires 100% unit
coverage; build/install guidance must cover native SQLite support  
**Scale/Scope**: Single-user local workspace, hundreds to low-thousands of persisted records, one
durable database per runtime profile

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] Code quality approach is evidence-based, keeps scope tight, and explains any new abstraction
      or dependency.
- [x] Testing plan covers the smallest effective test layer, includes 100% unit coverage for
      changed code, and adds broader contract/integration/E2E coverage when user-visible or API
      behavior changes.
- [x] UX impact is documented for affected journeys: startup recovery, Hermes task handling,
      manual task completion, and persistence error feedback.
- [x] Performance-sensitive paths are identified: startup bootstrap, single-write persistence, and
      Hermes polling/query paths.
- [x] Documentation and contract impacts are identified: `README.md`, `docs/openapi.yaml`,
      `docs/HERMES_INTEGRATION.md`, and build/install notes.

Post-design review: PASS. The selected design keeps existing task flows intact, introduces only the
minimum new runtime interfaces needed for durable history/state restore, and adds explicit test and
docs work for both runtimes.

## Project Structure

### Documentation (this feature)

```text
specs/001-durable-task-memory/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── persistence-http.yaml
│   └── tauri-persistence.md
└── tasks.md
```

### Source Code (repository root)

```text
app.js
server.js
src-tauri/
├── Cargo.toml
└── src/
    ├── lib.rs
    ├── main.rs
    ├── persistence.rs        # new
    └── [existing proxy/vault modules]
tests/
├── app.spec.js
├── hermes-ui.spec.js
├── memory_api.spec.js
└── unit/
    ├── endpoints.spec.mjs
    ├── [existing memory/hermes specs]
    └── [new persistence unit specs]
docs/
├── openapi.yaml
└── HERMES_INTEGRATION.md
artifacts/
├── build-windows.ps1
├── build-linux.sh
└── build-macos.sh
README.md
```

**Structure Decision**: Preserve the current single-repo layout. Add persistence modules inside the
existing Node server and Tauri backend rather than creating a separate service, and keep frontend
integration in `app.js` through a small runtime-aware persistence gateway.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | The plan stays within existing web + Tauri runtime boundaries |
