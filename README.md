# Agent Bar Hangout

> **⚠️ IMPORTANT DISCLAIMER**
>
> This project was almost entirely built by AI agents. Use at your own risk. The code, assets, and documentation may contain errors, unexpected behavior, or security considerations that have not been fully vetted by a human. No warranties or guarantees are provided.

A typical-themed 3D bar where AI "worker agents" hang out waiting for task assignments. Assign tasks to four distinct agents — **Nova**, **Quinn**, **Rune**, and **Sol** — and watch them work through configurable MCP (Model Context Protocol) adapters, all rendered in a neon-lit Three.js bar scene.

![License](https://img.shields.io/badge/license-MIT-green)

![Agent Bar Hangout Screenshot](docs/AgentBarHangout.png)

---

## Features

### 3D Bar Scene
- Full WebGL bar environment rendered with **Three.js v0.170.0**
- GLB model loading (bar scene, beer mugs, crowd) with procedural fallbacks
- Four stylized agents with sunglasses, smirks, name-label sprites, and beer mugs
- Idle/working animations (bobbing, swaying, leaning forward)
- Angry leave animation when assigned a task (red glow, stomping, turning away from bar)
- Walk-back and beer sip animation when returning from a completed task
- Orbit camera controls, raycasting for click/hover selection
- Selection rings and hover tooltips

### Agent System
| Agent | Role |
|-------|------|
| **Nova** | Logistics Lead |
| **Quinn** | Data Whisperer |
| **Rune** | Ops Alchemist |
| **Sol** | Field Liaison |

- Assign tasks with title, instructions, ETA, and MCP adapter selection
- Task progress pipeline: connect → MCP tool calls → process → result → verify → done
- Per-agent task history and working animations

### MCP Adapter Registry (19 Built-In)
| Adapter | Type | Description |
|---------|------|-------------|
| 🐙 **GitHub** | Real | Repo, issue, and PR fetching via GitHub REST API |
| 📁 **Filesystem** | Simulated | File read/write/list operations |
| 🤖 **AI Search** | Real | LLM-powered queries via multiple AI vendors (ChatGPT, Claude, Gemini, Grok, DeepSeek, Ollama, Mistral, Cohere, Perplexity) |
| 🗄️ **Database** | Simulated | SQL query execution |
| 💬 **Slack** | Real | Channel messaging via Slack API |
| ⚡ **Terminal** | Real | Live shell command execution (PowerShell / bash) |
| 🔷 **Atlassian** | Simulated | Jira/Confluence integration |
| 🟠 **HubSpot** | Simulated | CRM contact/deal management |
| ☁️ **AWS** | Simulated | Cloud infrastructure management |
| 📧 **Email** | Real | Email operations via SMTP/IMAP |
| 📅 **Calendar** | Simulated | Calendar event management |
| 📊 **Monitoring** | Simulated | System/application monitoring |
| 🐳 **Docker** | Simulated | Container management |
| 📝 **Notion** | Simulated | Workspace page management |
| 🔍 **Web Search** | Real | Wikipedia-powered search |
| 💳 **Stripe** | Real | Payment processing via Stripe API |
| 📈 **Analytics** | Simulated | Product analytics |
| 🦞 **OpenClaw** | Real | AI agent runtime gateway |

Custom adapters can be added through the MCP configuration modal. Adapter settings persist to `localStorage` (web mode) or the **OS keyring** (Tauri desktop mode — Windows DPAPI, macOS Keychain, Linux libsecret).

### Real API Integrations
- **Multi-LLM AI Search** — proxied through the Node.js server (web) or Rust backend (Tauri) supporting 9 vendors (OpenAI, Anthropic, Google, xAI, DeepSeek, Ollama, Mistral, Cohere, Perplexity) with per-agent rolling conversation context (3-min TTL, max 5 message pairs)
- **GitHub REST API** — fetch repos, issues, and PRs when configured with a token
- **wttr.in** — real weather data with natural language location extraction
- **Wikipedia** — web search fallback via MediaWiki API

### UI Panels
- Bar stage (3D canvas)
- Agent roster grid with status indicators
- Task assignment form with adapter selection
- Active tasks list with progress bars and step logs
- Work Output pane (streaming response feed)
- Agent Output pane (final results)
- Activity Log table
- MCP configuration modal
- Toast notifications

---

## Prerequisites

### Desktop App (Tauri)
- **Node.js** (v18+ recommended)
- **Rust** (1.77.2+ — install via [rustup](https://rustup.rs/))
- **npm** (bundled with Node.js)
- An **LLM API key** (optional — needed for AI Search adapter; supports OpenAI, Anthropic, Google, xAI, DeepSeek, Mistral, Cohere, Perplexity, or local Ollama)

### Web Mode (Browser)
- **Node.js** (v18+ recommended)
- An **LLM API key** (optional)

No `npm install` required for web mode — all client dependencies (Three.js) are loaded via CDN import maps.

---

## Setup

### 1. Clone the repository
```bash
git clone https://github.com/mmarti8895/agent-bar-hangout.git
cd agent-bar-hangout
```

### 2. Create a `.env` file (optional)
Copy the example environment file and fill in your values:
```bash
cp .env.example .env        # Linux / macOS
Copy-Item .env.example .env # PowerShell
```
Then edit `.env` and set any keys you need (e.g. `OPENAI_API_KEY`). See [`.env.example`](.env.example) for all available options. Other LLM vendors can be configured at runtime in the MCP Configuration modal.

### Desktop App (Tauri)
```bash
npm install
npm run tauri:dev      # Development (hot-reload)
npm run tauri:build    # Production binary
```

This launches the native desktop window (1400×900). The Rust backend provides OS keyring credential storage, LLM proxy, service proxies, and terminal execution.

### Building Executables

Platform-specific build scripts are in the `artifacts/` folder. Each script installs dependencies, runs `npm run tauri:build`, and copies the resulting installers to `artifacts/builds/`.

| Platform | Script | Output |
|----------|--------|--------|
| **Windows** | `./artifacts/build-windows.ps1` | `.exe` NSIS setup installer |
| **Linux** | `./artifacts/build-linux.sh` | `.deb`, `.rpm`, `.AppImage` |
| **macOS** | `./artifacts/build-macos.sh` | `.dmg`, `.app.tar.gz` |

```bash
# Windows (PowerShell)
.\artifacts\build-windows.ps1

# Linux / macOS
chmod +x ./artifacts/build-linux.sh   # or build-macos.sh
./artifacts/build-linux.sh
```

Build outputs are written to `artifacts/builds/`.

> **Note:** You must build on the target platform — cross-compilation is not supported by Tauri. Linux builds require additional system dependencies (see the script header for details).

### Running the Desktop App

After building, run the app using the installer or standalone executable from `artifacts/builds/`:

| Platform | How to Run |
|----------|-----------|
| **Windows** | Run `Agent Bar Hangout_0.1.0_x64-setup.exe` (NSIS installer) to install, then launch from the Start Menu. Or run `agent-bar-hangout.exe` directly (standalone, no install needed). |
| **Linux** | Install via `sudo dpkg -i *.deb` or `sudo rpm -i *.rpm`, then launch from your app menu. Or run the `.AppImage` directly: `chmod +x *.AppImage && ./*.AppImage` |
| **macOS** | Open the `.dmg`, drag the app to Applications, and launch from the Dock/Spotlight. Or extract the `.app.tar.gz` and run the `.app` bundle directly. |

The desktop app runs fully standalone — no Node.js server needed. LLM proxying, credential storage, terminal execution, and service integrations are all handled by the built-in Rust backend.

### Web Mode (Browser)
```bash
node server.js
```
Open `http://localhost:8080` in your browser.

The port defaults to `8080` and can be changed via the `PORT` environment variable.

---

## Testing

### Playwright E2E Tests (59 tests)
```bash
npm install
npx playwright install --with-deps chromium
npx playwright test
```

### Unit Tests (52 tests)
Covers location extraction, weather API calls, multi-city fetches, edge cases, and LLM proxy integration.

```bash
node test-web-fetch.mjs
```

For tests that exercise the LLM proxy endpoint, start the server on port 3000 first:
```bash
PORT=3000 node server.js
# In another terminal:
node test-web-fetch.mjs
```

### Hermes Integration (dev)

The dev server exposes a minimal Hermes-compatible assignment endpoint and a small persistent memory API useful for local integrations and testing.

Memory store
- File: `memories.json` at the project root (created on first write).
- Behavior: writes are atomic (written to a temp file then renamed) to avoid partial/corrupt files during concurrent updates.
- Intended use: short-lived test state, task queues, and simple integration testing only. Do not rely on this store for production data or concurrent multi-process deployments.

API Endpoints
- `POST /api/hermes/assign` — Accepts a Hermes-style payload and stores a normalized task object in the memory store. Example body:

```json
{
  "taskId": "hermes-1",
  "title": "Check inventory",
  "instructions": "Count bottles on shelf A",
  "etaMinutes": 15,
  "targetAgent": "Nova",
  "metadata": { "priority": "high" }
}
```

- `POST /api/memory/get` — Body: `{ key?: string }`. Returns the stored value for `key`, or the full store when `key` is omitted.

- `POST /api/memory/set` — Body: `{ key: string, value: any }`. Persists `value` under `key` in `memories.json`. To remove a key set its value to `null`.

Examples
- Assign a Hermes task (curl):

```bash
curl -X POST http://localhost:3000/api/hermes/assign \
  -H 'Content-Type: application/json' \
  -d '{"taskId":"hermes-1","title":"Check inventory","instructions":"Count bottles","targetAgent":"Nova"}'
```

- Read memory (JS fetch):

```js
const res = await fetch('/api/memory/get', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ key: 'hermes_tasks' }) });
const data = await res.json();
```

Migration & production guidance
- This file-backed store is a development convenience. For production use prefer a proper database (Postgres/SQLite) or a durable queue.
- If you need zero-native-deps local persistence, consider `sql.js` (WebAssembly SQLite) or a managed service. Native `better-sqlite3` may require a compatible build toolchain on CI/Windows.

Security
- The memory and Hermes endpoints are intentionally unprotected in the dev server. Do not expose the dev server to untrusted networks. Add authentication and authorization before using these endpoints in shared environments.


### Test Coverage

**Playwright E2E — 59 tests, all passing**

```
Running 59 tests using 2 workers
  59 passed (5.1m)
```

**Unit Tests — 52 tests, all passing**

```
Results: 52 passed, 0 failed
```

| # | Suite | Tests | Covers |
|---|-------|------:|--------|
| 1 | Page load | 4 | Title, sections, roster, canvas rendering |
| 2 | Agent selection | 4 | Default selection, click, arrow-key cycling, role display |
| 3 | Task assignment form | 7 | Required fields, validation, MCP checkboxes, task creation, response pane, activity log |
| 4 | MCP configuration modal | 5 | Open/close, adapter listing, custom adapter form, adding |
| 5 | Task pipeline execution | 3 | Progress steps, agent output, GitHub simulated output |
| 6 | Clear buttons | 2 | Clear response pane, clear activity log |
| 7 | Toast notifications | 1 | Task-assignment toast |
| 8 | MCP adapter panel | 2 | Card rendering, count label |
| 9 | Multi-adapter task | 1 | Multiple adapters produce output |
| 10 | Responsive layout | 1 | Narrow viewport |
| 11 | Server API | 10 | `/api/chat`, `/api/slack`, `/api/stripe`, `/api/terminal` (exec, validation, length), CORS (localhost, tauri, unknown), static files, 404 |
| 12 | Task history | 1 | Completed task moves to history |
| 13 | **Agent walk animations** | **15** | **Angry leave (walkState, position, red glow, stomp bounce), leaving→away transition, away offset position, finish→returning trigger, returning→sipping with beer mug visible, sipping→at-bar with beer hidden, full position cycle, second task while away stays put, sip interrupted by new task, markTaskDone triggers returning, easeInOutCubic correctness, independent agent walks** |

- **18 location extraction cases** — parsing cities from natural language weather queries
- **Real weather API calls** — live requests to wttr.in
- **Multi-city fetches** — concurrent weather lookups
- **Edge cases** — bare queries, Unicode characters, malformed input
- **LLM proxy** — end-to-end multi-vendor AI proxy integration (requires running server)

---

## Usage

1. **Select an agent** by clicking their card in the roster or clicking them in the 3D scene. Use arrow keys to cycle.
2. **Assign a task** using the task form — enter a title, instructions, pick an MCP adapter, and set an ETA.
3. **Watch progress** in the Active Tasks panel as the agent works through the pipeline steps.
4. **View results** in the Work Output and Agent Output panes.
5. **Configure adapters** via the MCP Configuration button — add API keys, endpoints, or create custom adapters.

---

## Project Structure

```
├── index.html              # Main HTML — layout, import maps, dialog markup
├── app.js                  # Client application — Three.js scene, agent system,
│                           #   MCP adapters, task pipeline, UI logic (~3.5k lines)
├── style.css               # Cyberpunk-themed styles, layout, responsive design
├── server.js               # Node.js dev server — static files + multi-LLM proxy
├── build-frontend.js       # Copies web assets to dist/ for Tauri builds
├── test-web-fetch.mjs      # Unit tests for weather/location/LLM features
├── tests/
│   └── app.spec.js         # Playwright E2E tests (58 tests)
├── playwright.config.js    # Playwright test configuration
├── package.json            # Dependencies (Tauri CLI, Tauri API, Playwright)
├── .env                    # LLM API keys (not committed)
├── AGENTS.md               # AI agent coding rules and workflow contract
├── DESIGN.md               # Design specification and architecture notes
├── ASSETS.md               # Asset inventory and sourcing details
├── ASSET_IMPORT.md         # Asset import pipeline documentation
├── dist/                   # Frontend build output for Tauri (gitignored, auto-generated)
├── artifacts/
│   ├── build-windows.ps1   # Windows build script (PowerShell)
│   ├── build-linux.sh      # Linux build script (bash)
│   ├── build-macos.sh      # macOS build script (bash)
│   └── builds/             # Built installers & executables (gitignored)
├── src-tauri/              # Tauri desktop app backend
│   ├── Cargo.toml          # Rust dependencies (reqwest, keyring, tokio, etc.)
│   ├── tauri.conf.json     # Tauri window, CSP, build config
│   ├── Entitlements.plist  # macOS sandbox / file-access entitlements
│   ├── capabilities/       # Tauri permission capabilities
│   └── src/
│       ├── lib.rs           # Tauri command registration
│       ├── main.rs          # Tauri entry point
│       ├── vault.rs         # OS keyring credential storage
│       ├── proxy.rs         # Multi-LLM chat proxy (9 vendors + context)
│       ├── api_proxy.rs     # Service proxies (Slack, Stripe, Email, OpenClaw)
│       └── terminal.rs      # Shell command execution (30s timeout)
└── public/
    └── assets/
        └── bar/
            ├── bar-scene.glb   # Main bar environment 3D model
            ├── BEER.glb        # Beer mug 3D model
            └── crowd.glb       # Crowd/background 3D model
```

---

## Tech Stack

| Technology | Usage |
|---|---|
| **Tauri v2** | Native desktop shell (Windows, macOS, Linux) |
| **Rust 1.77.2+** | Tauri backend — keyring vault, LLM proxy, service proxies, terminal exec |
| **Three.js v0.170.0** | 3D scene rendering, GLTFLoader, OrbitControls |
| **Node.js (ESM)** | Web-mode development server with multi-LLM API proxy |
| **OpenAI / Anthropic / Google / xAI / DeepSeek / Ollama / Mistral / Cohere / Perplexity** | AI Search completions (multi-vendor) |
| **OS Keyring** | Credential storage — Windows DPAPI, macOS Keychain, Linux libsecret (Tauri mode) |
| **reqwest** | Rust HTTP client for LLM and service API proxying |
| **wttr.in** | Real-time weather data |
| **GitHub REST API** | Repository, issue, and PR data |
| **Wikipedia API** | Web search fallback |
| **HTML `<dialog>`** | Native modal for MCP configuration |
| **CSS Custom Properties** | Dark cyberpunk theming |
| **ES Modules** | Client and server module system |
| **localStorage** | MCP adapter config persistence (web mode) |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` / `→` | Cycle through agents |
| Click agent card | Select agent |
| Click 3D agent | Select agent + camera focus |

---

## License

[MIT](LICENSE)
