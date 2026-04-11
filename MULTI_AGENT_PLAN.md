Implement the plan:


Multi-Agent Codex Plan: Agent Bar Hangout — Roadmap Implementation

How to Use This Plan

Hand each numbered "Agent Task" below as a separate prompt to a Codex agent. Each task:



Ends with a 10-round self-review loop (described in the Wrapper Instructions at the bottom of this plan).

Includes mandatory Playwright + unit tests.

Includes a vulnerability check pass.

Must open a PR — never push directly to main.



Wrapper Instructions (append to every agent task below)


Before opening a PR, repeat the following self-review loop 10 times:



Re-read every line of code you changed or added.

Ask yourself:

Does the behavior exactly match the spec? (expected behavior)

Are there off-by-one errors, null-dereferences, race conditions, or uncovered branches? (bugs)

Could user-supplied data flow into eval(), shell commands, SQL, HTML output, file paths, or network requests without sanitization? (security vulnerabilities)



If you find any issue, fix it and restart the loop count.

After 10 clean passes, open a draft PR with: what changed, how to test it, coverage numbers, and docs updated.


Test requirements for all tasks:



Add/extend Playwright E2E tests in tests/ for any UI change.

Add/extend unit tests in tests/unit/ for any server/logic change.

Run npm run coverage:unit and ensure 100% coverage for all new/changed code paths.

Run npm test (Playwright) and ensure all tests pass.


Security requirements for all tasks:



Sanitize all user input before it touches the DOM (use textContent not innerHTML for dynamic text, or a trusted sanitizer).

Validate all server-side inputs; reject unexpected shapes with 400.

Never log or echo back secret keys or tokens.

Use Content-Security-Policy headers on all server responses.

Avoid eval(), Function(), innerHTML with untrusted data, and shell injection vectors.




Agent Tasks — Easiest to Hardest


TASK 1 — Better Error Handling & Edge Case Tests (Easiest)

Scope: server.js, tests/unit/endpoints.spec.mjs, tests/unit/proxies.spec.mjs


Goal: Improve server robustness for all existing endpoints.


Steps:



Audit every POST handler in server.js. For each one:

Add explicit checks for required fields; return { error: "...", status: 400 } with HTTP 400 for bad input.

Ensure no uncaught JSON.parse can crash the server — wrap in try/catch.

Add a Content-Security-Policy: default-src 'self' header to every response from the server.



Add unit tests for every new error path: missing fields, malformed JSON, oversized payloads (>1 MB body).

10-round self-review, then PR.



TASK 2 — Comprehensive Error Handling UI Toast for All Async Failures (Easy)

Scope: app.js, tests/


Goal: Every fetch() call in app.js must show a user-friendly toast on failure rather than silently swallowing errors.


Steps:



Grep for every fetch( call in app.js. For each one, ensure the .catch() (or try/catch) branch calls showToast('<descriptive error>').

Ensure no error message ever includes raw API keys or tokens.

Add Playwright tests that intercept network requests and return 500/network-error, then assert the toast appears.

10-round self-review, then PR.



TASK 3 — Mobile-Friendly Responsive Layout (Easy)

Scope: style.css, index.html, tests/


Goal: Make the app usable on screens ≥ 360 px wide with touch controls (tap to select agent, tap to assign task).


Steps:



Add CSS media queries for breakpoints: 360 px, 600 px, 900 px.

Stack the sidebar below the canvas at ≤ 900 px; collapse roster into a horizontal scroll strip.

Ensure all interactive elements have a minimum 44×44 px tap target.

Add touch-action: manipulation to canvas; wire touchstart alongside click for agent selection.

Add Playwright tests using page.setViewportSize({ width: 375, height: 812 }) to assert layout and tap interaction.

10-round self-review, then PR.



TASK 4 — User Onboarding Experience (Easy-Medium)

Scope: index.html, app.js, style.css, tests/


Goal: First-time users (no localStorage flag set) see an interactive tutorial overlay walking through key features.


Steps:



Create a tutorial.js module. On first load (key agentBar_tutorialDone absent from localStorage), show a step-by-step highlight overlay:

Step 1: "Click any agent in the 3D scene to select them."

Step 2: "Fill in a task title and press Assign."

Step 3: "Watch the progress pipeline in real time."

Step 4: "Open MCP Config to plug in real APIs."



Highlight the relevant DOM element with a semi-transparent overlay + pointer arrow per step.

"Skip tutorial" and "Next" buttons; mark done in localStorage when finished.

Sanitize: tutorial text must be static strings, not dynamic user input.

Playwright tests: assert overlay visible on fresh load; assert it does not appear after localStorage flag is set.

10-round self-review, then PR.



TASK 5 — Internationalization (i18n) Foundation (Easy-Medium)

Scope: app.js, index.html, new i18n/ folder, tests/


Goal: Extract all hard-coded English strings into a locale file; add Spanish as a second locale; add a language switcher.


Steps:



Create i18n/en.json and i18n/es.json with translations of all UI labels and toast messages.

Add a lang.js module that loads the correct locale (defaulting to browser navigator.language) and exposes a t(key) function.

Replace all hard-coded strings in index.html and app.js with t('key') calls.

Add a language switcher <select> in the sidebar header; persist choice in localStorage.

Sanitize: locale keys are static; never use user-supplied strings as HTML.

Playwright tests: switch to es, assert at least one translated label appears.

10-round self-review, then PR.



TASK 6 — Customizable Themes (Easy-Medium)

Scope: style.css, app.js, index.html, tests/


Goal: Users can switch between at least 3 color themes (Neon Dark — existing, Soft Light, Synthwave) persisted in localStorage.


Steps:



Convert all color definitions in style.css to CSS custom properties on :root (--color-bg, --color-accent, etc.).

Define theme classes (.theme-neon, .theme-light, .theme-synthwave) each overriding the variables.

Add a theme picker button/dropdown in the sidebar; apply the class on <body>; persist in localStorage.

Playwright tests: switch theme, reload, assert the correct class is still applied.

10-round self-review, then PR.



TASK 7 — localStorage → SQLite Persistent Database (Medium)

Scope: server.js, tests/unit/, PERSISTENCE.md, README.md


Goal: Replace memories.json file storage with better-sqlite3 (or sql.js for zero-native-deps) for durable, concurrent-safe persistence.


Steps:



Read PERSISTENCE.md for the proposed schema.

Add better-sqlite3 as a dependency (run npm install better-sqlite3; check advisory DB first).

Create db.js: open/create data/memories.db, run migrations to create memories and hermes_tasks tables on startup.

Replace all readFile/writeFile calls on memories.json in server.js with db.js helpers.

Write atomic upsert helpers; ensure concurrent requests cannot corrupt state.

Security: parameterize all queries — no string interpolation into SQL.

Unit tests: cover set, get, list, migration idempotency; use an in-memory :memory: database for tests.

Update PERSISTENCE.md and README.md.

10-round self-review, then PR.



TASK 8 — Performance: Lazy Loading, Efficient State, Optimized Rendering (Medium)

Scope: app.js, index.html, server.js, tests/


Goal: Reduce initial load time and maintain 60 fps under 4+ concurrent active tasks.


Steps:



Lazy-load the Three.js GLB asset — show a progress bar until GLTFLoader resolves.

Debounce DOM re-renders: batch task list updates into a requestAnimationFrame flush cycle instead of re-rendering on every state mutation.

Limit the Activity Log table to the last 200 rows (virtual scroll or DOM recycling) to prevent unbounded DOM growth.

Server: stream large responses using Node.js streams rather than buffering the full body.

Add a Playwright performance assertion: page.metrics() → DOMContentLoaded < 3000 ms on a cold load.

10-round self-review, then PR.



TASK 9 — Additional MCP Adapters: Webhooks + Custom Plugin System (Medium)

Scope: app.js, server.js, index.html, tests/


Goal: Allow community-contributed adapter plugins, and add a Webhook-out adapter.


Steps:



Define a plugin contract: a JS module exporting { id, name, icon, description, tools: [{ name, description, handler }] }.

Add a plugins/ folder; scan it at server startup and register discovered adapters.

Add a built-in Webhook adapter: on tool call, POST a configurable URL with a signed HMAC-SHA256 header (secret set in MCP config); validate the URL is a valid HTTPS URL before making any request.

Security: validate webhook URL (must be https://); never follow redirects to http://; set a 10-second timeout; sanitize outgoing payload to remove internal credentials.

Unit tests: test URL validation rejects http://, file://, javascript:, localhost; test HMAC generation; test plugin loader with a mock plugin.

Playwright tests: configure a Webhook adapter in the modal, assign a task, assert the webhook call is logged.

10-round self-review, then PR.



TASK 10 — Analytics & Monitoring Dashboard (Medium-Hard)

Scope: server.js, app.js, index.html, new analytics.js, tests/


Goal: Add an Analytics panel showing task completion rates, average duration by agent, and daily activity charts.


Steps:



Server: add POST /api/analytics/event to record events (task_assigned, task_completed, task_failed) to the SQLite DB (or memories.json if Task 7 is not yet merged).

Server: add GET /api/analytics/summary?from=&to=&agentId= returning aggregated metrics. Validate date params; SQL-parameterize all queries.

Client: add an Analytics tab in the sidebar using native <canvas> (or a simple SVG bar chart) — no new libraries.

Security: ensure from/to are validated as ISO date strings; reject otherwise.

Unit tests: cover the aggregation logic with fixed dataset.

Playwright tests: assign+complete 3 tasks, open Analytics, assert counts and chart render.

10-round self-review, then PR.



TASK 11 — User Authentication & Multi-User Support (Hard)

Scope: server.js, new auth.js, app.js, index.html, tests/


Goal: Add session-based authentication (username + password) with RBAC (admin, viewer roles). Admins can assign tasks; viewers can only observe.


Steps:



auth.js: store users in SQLite; hash passwords with bcrypt (or crypto.scrypt to avoid native deps); issue signed HttpOnly session cookies (use crypto.randomBytes(32) as secret; never hard-code).

POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me endpoints; all protected endpoints check session.

Middleware: wrap all /api/* routes (except /api/auth/*) with session validation; return 401 if not authenticated.

Client: add a login screen before the main app; store session state in memory (not localStorage); handle 401 by redirecting to login.

Security: protect against brute force (rate-limit login to 5 attempts/min per IP); use Secure; HttpOnly; SameSite=Strict cookie attributes; CSRF token for state-changing endpoints; validate and sanitize all login inputs.

Unit tests: 100% coverage on auth helpers, middleware, and routes (use mocked crypto).

Playwright tests: assert unauthenticated users see login; admin flow; viewer cannot see assign form.

Update README.md with auth setup.

10-round self-review, then PR.



TASK 12 — Real-Time Multi-User Collaboration via WebSockets (Hard)

Scope: server.js, app.js, new ws.js, tests/


Goal: Multiple authenticated users can open the app simultaneously and see each other's task assignments and agent status changes in real time.


Steps:



Add a WebSocket server (ws npm package) alongside the HTTP server in server.js.

On each state-changing event (task assigned, task updated, task completed), broadcast a typed message to all connected clients: { type: 'task_update', agentId, task }.

Client: open a WebSocket connection on load; on message received, merge the incoming state diff into local state and re-render.

Security: authenticate the WebSocket upgrade using the same session cookie; reject unauthenticated upgrades with 401.

Handle disconnects gracefully — clients reconnect with exponential backoff (cap at 30 s).

Unit tests: mock WebSocket; test broadcast, auth middleware, reconnect logic.

Playwright tests (multi-page): open two browser contexts, assign task in one, assert it appears in the other.

10-round self-review, then PR.



TASK 13 — Comprehensive Security Hardening & Audit (Hard)

Scope: All files — focused review pass, not a feature addition.


Goal: Address the entire security surface of the app systematically.


Steps:



Add a strict CSP header to every HTTP and WebSocket upgrade response.

Add X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy: no-referrer to all HTTP responses.

Audit all innerHTML usages in app.js and index.html; replace with textContent or a DOM builder for dynamic content; use DOMPurify (or equivalent) only where rich HTML is genuinely needed.

Validate all file-serving paths in the static server to prevent path traversal (ensure resolve(filePath).startsWith(PUBLIC_ROOT)).

Add server-side rate limiting for all API endpoints (sliding window, in-memory, 60 req/min per IP).

Audit the Terminal (/api/terminal) adapter: ensure commands are passed to a whitelist-only exec or at minimum strip shell metacharacters; document the risk.

Unit tests: path traversal attempts return 403; rate limit correctly rejects the 61st request.

Playwright tests: CSP header present on page load response; X-Frame-Options present.

10-round self-review, then PR.



TASK 14 — Advanced AI: Complex Task Workflows with Dependencies (Hardest)

Scope: app.js, server.js, index.html, new workflow.js, tests/


Goal: Allow task definitions to declare dependencies (task B starts only after task A completes), conditional branching, and parallel fan-out across multiple agents.


Steps:



Extend the Task data model: add dependsOn: string[], condition: string | null (a safe expression evaluated server-side), parallelWith: string[].

Server: add POST /api/workflow/submit accepting a DAG of tasks; validate the graph is acyclic (topological sort); reject cycles with 422.

Server: a scheduler loop processes ready tasks (all dependencies met), dispatches to the assigned agent's LLM proxy, and updates state.

Client: render a mini dependency graph in the task panel using SVG lines between task cards.

Security: condition expressions must be evaluated in a sandboxed context (use vm.runInNewContext with a strict timeout and empty context — NOT eval()); reject any condition that times out or throws.

Unit tests: DAG validation (cycle detection, valid chains), condition sandbox (timeout enforcement, no process access), scheduler state machine.

Playwright tests: submit a 3-task workflow; assert B doesn't start until A completes; assert parallel tasks run concurrently.

10-round self-review, then PR.



Suggested Sequencing for Parallelism

These tasks can be worked in parallel (no shared files):


Parallel Batch	Tasks
Batch 1	Task 1 + Task 2 + Task 3
Batch 2	Task 4 + Task 5 + Task 6
Batch 3	Task 7 + Task 8
Batch 4	Task 9 + Task 10
Batch 5	Task 11 (auth first — Task 12 depends on it)
Batch 6	Task 12 (depends on Task 11)
Batch 7	Task 13 (security audit — should be last)
Batch 8	Task 14 (most complex — should be last)


Repo Context to Include in Every Agent Prompt

Code
Repository: mmarti8895/agent-bar-hangout
Language: JavaScript (ES Modules), Node.js ≥ 18
Server: server.js (ESM, http module, port 8080)
Client: app.js + index.html (vanilla JS, Three.js via CDN)
Tests: npm test (Playwright, testDir: ./tests, webServer: node server.js)
Unit tests: npm run coverage:unit (c8, tests/unit/)
No bundler — client code must work as plain ES modules in the browser
No external CSS frameworks — vanilla CSS only
Security rule: never use innerHTML with untrusted data; never interpolate user input into SQL or shell commands
PR rule: always open a draft PR; never push directly to main