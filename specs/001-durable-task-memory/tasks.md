# Tasks: Durable Task Memory

**Input**: Design documents from `/specs/001-durable-task-memory/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are REQUIRED for every behavior change. Include the smallest effective test
layer first, require 100% unit coverage for changed code, and add broader contract, integration,
or E2E coverage when APIs or user-visible flows change.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `app.js`, `server.js`, `src-tauri/`, `tests/`, and `docs/` at repository root
- Paths below use the current web + Tauri repo layout from `plan.md`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare dependency, fixture, and build/test prerequisites for durable SQLite-backed persistence.

- [x] T001 Add durable persistence dependencies and scripts in `package.json` and `src-tauri/Cargo.toml`
- [ ] T002 [P] Prepare SQLite-backed CI prerequisites in `.github/workflows/ci.yml` and `.github/workflows/coverage.yml`
- [ ] T003 [P] Add durable persistence fixture data in `tests/fixtures/memories.seed.json` and `tests/fixtures/memories.empty.json`
- [x] T004 Identify durable persistence documentation touchpoints in `README.md`, `docs/openapi.yaml`, `docs/HERMES_INTEGRATION.md`, and `PERSISTENCE.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared persistence infrastructure required before any user story can ship.

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create the Node SQLite persistence repository and migration helpers in `persistence.js`
- [x] T006 [P] Create the Tauri SQLite persistence module with schema helpers in `src-tauri/src/persistence.rs`
- [x] T007 [P] Register Tauri persistence commands in `src-tauri/src/lib.rs`
- [x] T008 [P] Add a runtime-aware renderer persistence gateway and bootstrap helpers in `app.js`
- [x] T009 Implement shared HTTP bootstrap and task persistence endpoints in `server.js`
- [x] T010 Extend the Node coverage runner for persistence suites in `tests/unit/run_coverage.cjs`

**Checkpoint**: Shared durable persistence infrastructure is ready for story-specific behavior.

---

## Phase 3: User Story 1 - Recover Work Across Restarts (Priority: P1) MVP

**Goal**: Restore active tasks, task history, and application memory after restart in both web and Tauri runtimes.

**Independent Test**: Save memory plus active/completed tasks, restart the web runtime or Tauri app, and verify the same state is restored without manual recovery.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T011 [P] [US1] Add Node repository/bootstrap unit coverage in `tests/unit/persistence.spec.mjs`
- [x] T012 [P] [US1] Add Tauri persistence unit coverage in `src-tauri/src/persistence.rs`
- [x] T013 [P] [US1] Add restart recovery E2E coverage for active/history restore in `tests/app.spec.js`

### Implementation for User Story 1

- [x] T014 [US1] Persist manual task creation/completion and restore agent history on bootstrap in `app.js`
- [x] T015 [US1] Support durable task bootstrap, upsert, transition, and delete behavior in `server.js`
- [x] T016 [US1] Implement standalone Tauri bootstrap, upsert, transition, and delete commands in `src-tauri/src/persistence.rs` and `src-tauri/src/lib.rs`
- [x] T017 [US1] Add persistence failure feedback and startup restore guards in `app.js`

**Checkpoint**: Manual tasks and history survive restart and are independently testable in web and desktop flows.

---

## Phase 4: User Story 2 - Preserve Existing Integrations (Priority: P2)

**Goal**: Keep the documented Hermes-compatible and memory API behavior working while durable persistence replaces file-backed storage.

**Independent Test**: Submit Hermes tasks and memory writes through the current integration flow, restart the system, and verify records remain available through the same compatibility paths.

### Tests for User Story 2

- [ ] T018 [P] [US2] Add durable memory API compatibility coverage in `tests/memory_api.spec.js` and `tests/unit/endpoints.spec.mjs`
- [ ] T019 [P] [US2] Add Hermes queue compatibility and recovery coverage in `tests/hermes-ui.spec.js` and `tests/hermes.spec.js`

### Implementation for User Story 2

- [x] T020 [US2] Preserve `/api/memory/*` and `/api/hermes/*` semantics on top of SQLite in `server.js`
- [x] T021 [US2] Route Hermes polling, accept, and reject flows through the shared persistence gateway in `app.js`
- [x] T022 [US2] Mirror memory and Hermes compatibility commands for the standalone runtime in `src-tauri/src/persistence.rs` and `src-tauri/src/lib.rs`

**Checkpoint**: Existing integrations continue to work without payload changes while using durable storage underneath.

---

## Phase 5: User Story 3 - Upgrade Safely from File-Backed State (Priority: P3)

**Goal**: Preserve existing `memories.json` data through an idempotent migration with clear failure reporting.

**Independent Test**: Start with representative file-backed data, run the upgrade path, and verify prior records appear once in durable storage with actionable failure reporting when migration cannot complete.

### Tests for User Story 3

- [x] T023 [P] [US3] Add Node migration and failure-path unit coverage in `tests/unit/persistence-migration.spec.mjs`
- [x] T024 [P] [US3] Add Tauri migration and idempotency unit coverage in `src-tauri/src/persistence.rs`

### Implementation for User Story 3

- [x] T025 [US3] Implement idempotent import from `memories.json` into SQLite in `persistence.js`
- [x] T026 [US3] Implement Tauri migration ledger and failure reporting in `src-tauri/src/persistence.rs`
- [x] T027 [US3] Surface migration status during bootstrap for web and desktop flows in `server.js` and `app.js`

**Checkpoint**: Existing file-backed state is preserved safely and migration behavior is independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Finish contracts, docs, build validation, and feature-wide quality checks.

- [x] T028 [P] Update durable persistence guidance in `README.md`, `docs/HERMES_INTEGRATION.md`, and `PERSISTENCE.md`
- [x] T029 [P] Update API contract documentation in `docs/openapi.yaml`
- [ ] T030 Validate platform build instructions and packaging notes in `artifacts/build-windows.ps1`, `artifacts/build-linux.sh`, and `artifacts/build-macos.sh`
- [ ] T031 [P] Validate quickstart, coverage evidence, and cross-runtime verification steps in `specs/001-durable-task-memory/quickstart.md`, `.github/workflows/ci.yml`, and `.github/workflows/coverage.yml`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1: Setup**: No dependencies - can start immediately
- **Phase 2: Foundational**: Depends on Phase 1 - BLOCKS all user stories
- **Phase 3: User Story 1**: Depends on Phase 2 - delivers the MVP
- **Phase 4: User Story 2**: Depends on Phase 2 and benefits from Phase 3 persistence paths, but remains independently testable
- **Phase 5: User Story 3**: Depends on Phase 2 and can proceed after the repository/migration foundation exists
- **Phase 6: Polish**: Depends on completion of the desired user stories

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational and establishes durable bootstrap/state restore
- **User Story 2 (P2)**: Starts after Foundational; uses the shared persistence layer but validates compatibility behavior independently
- **User Story 3 (P3)**: Starts after Foundational; uses the shared persistence layer but validates migration behavior independently

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Storage/repository changes before runtime wiring
- Runtime wiring before UX/error-state polish
- Documentation, UX validation, and performance validation complete before story sign-off

### Parallel Opportunities

- `T002`, `T003`, and `T004` can run in parallel during Setup
- `T006`, `T007`, and `T008` can run in parallel after `T005` establishes the persistence model
- `T011`, `T012`, and `T013` can run in parallel for US1
- `T018` and `T019` can run in parallel for US2
- `T023` and `T024` can run in parallel for US3
- `T028`, `T029`, `T030`, and `T031` can run in parallel during Polish

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together:
Task: "Add Node repository/bootstrap unit coverage in tests/unit/persistence.spec.mjs"
Task: "Add Tauri persistence unit coverage in src-tauri/src/persistence.rs"
Task: "Add restart recovery E2E coverage for active/history restore in tests/app.spec.js"

# Launch implementation work on disjoint files:
Task: "Persist manual task creation/completion and restore agent history on bootstrap in app.js"
Task: "Support durable task bootstrap, upsert, transition, and delete behavior in server.js"
Task: "Implement standalone Tauri bootstrap, upsert, transition, and delete commands in src-tauri/src/persistence.rs and src-tauri/src/lib.rs"
```

## Parallel Example: User Story 2

```bash
# Launch US2 compatibility tests together:
Task: "Add durable memory API compatibility coverage in tests/memory_api.spec.js and tests/unit/endpoints.spec.mjs"
Task: "Add Hermes queue compatibility and recovery coverage in tests/hermes-ui.spec.js and tests/hermes.spec.js"
```

## Parallel Example: User Story 3

```bash
# Launch US3 migration tests together:
Task: "Add Node migration and failure-path unit coverage in tests/unit/persistence-migration.spec.mjs"
Task: "Add Tauri migration and idempotency unit coverage in src-tauri/src/persistence.rs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate restart recovery in web and Tauri runtimes
5. Demo durable task/history restore before adding compatibility and migration refinements

### Incremental Delivery

1. Deliver the shared durable store and restart recovery first
2. Add integration compatibility without changing Hermes or memory contracts
3. Add safe migration from `memories.json`
4. Finish docs, build validation, and cross-runtime verification

### Parallel Team Strategy

With multiple developers:

1. One developer owns Node persistence (`persistence.js`, `server.js`, Node tests)
2. One developer owns Tauri persistence (`src-tauri/src/persistence.rs`, `src-tauri/src/lib.rs`, Rust tests)
3. One developer owns renderer integration and E2E validation (`app.js`, Playwright tests, docs)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps tasks to the corresponding user story for traceability
- Each user story remains independently testable after the foundational persistence layer is ready
- Verify tests fail before implementing and capture changed-code coverage evidence
- Always keep Hermes and memory compatibility behavior stable during the rollout
- Always include README/OpenAPI/doc updates when persistence behavior or setup changes
