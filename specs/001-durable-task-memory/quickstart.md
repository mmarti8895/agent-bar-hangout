# Quickstart: Durable Task Memory

## Prerequisites

1. Install JavaScript dependencies with `npm ci`.
2. Ensure Rust/Cargo is installed for Tauri validation.
3. If the Node SQLite dependency requires native compilation on your platform, ensure the local
   build environment used by the repo can compile native modules before running the full suite.

## Web Runtime Validation

1. Seed or keep an existing `memories.json` file with representative memory keys and Hermes tasks.
2. Start the web runtime with `node server.js`.
3. Assign a manual task in the UI, accept at least one Hermes task, and complete one task so both
   active and historical records exist.
4. Restart the server and reload the browser.
5. Verify:
   - pending Hermes tasks still appear
   - active tasks reload under the correct agent
   - completed tasks reappear in agent history
   - generic memory values remain readable

## Test Validation

1. Run `npm run coverage:unit` and confirm changed Node-side persistence code maintains 100% unit
   coverage.
2. Run targeted Playwright suites covering:
   - memory API compatibility
   - Hermes assign/reject/accept flows
   - restart recovery for agent task history
3. Run `cargo test` for the Tauri persistence module.

## Desktop Runtime Validation

1. Launch the desktop build with `npm run tauri:dev`.
2. Create and complete tasks from the renderer, then close and reopen the app.
3. Verify the same durable state is restored without a Node server running.
4. Confirm persistence failures surface clear UI feedback instead of silently dropping writes.

## Build Validation

1. Run `npm run tauri:build` after the persistence dependencies are added.
2. Run the relevant platform build script from `artifacts/` to verify the packaging path still
   works with the new persistence dependencies.
3. Update README and API docs so setup, migration, and durable persistence behavior are explicit.
