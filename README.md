# Agent Bar Hangout

A cyberpunk-themed 3D bar where AI "worker agents" hang out waiting for task assignments. Assign tasks to four distinct agents — **Nova**, **Quinn**, **Rune**, and **Sol** — and watch them work through configurable MCP (Model Context Protocol) adapters, all rendered in a neon-lit Three.js bar scene.

![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

### 3D Bar Scene
- Full WebGL bar environment rendered with **Three.js v0.170.0**
- GLB model loading (bar scene, beer mugs, crowd) with procedural fallbacks
- Four stylized agents with sunglasses, smirks, name-label sprites, and beer mugs
- Idle/working animations (bobbing, swaying, leaning forward)
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

### MCP Adapter Registry (8 Built-In)
| Adapter | Type | Description |
|---------|------|-------------|
| 🐙 **GitHub** | Real | Repo, issue, and PR fetching via GitHub REST API |
| 📁 **Filesystem** | Simulated | File read/write/list operations |
| 🤖 **AI Query** | Real | ChatGPT completions via OpenAI API proxy |
| 🗄️ **Database** | Simulated | SQL query execution |
| 💬 **Slack** | Simulated | Channel messaging |
| ⚡ **Terminal** | Simulated | Shell command execution |
| 🔷 **Atlassian** | Simulated | Jira/Confluence integration |
| 🟠 **HubSpot** | Simulated | CRM contact/deal management |

Custom adapters can be added through the MCP configuration modal. Adapter settings persist to `localStorage`.

### Real API Integrations
- **OpenAI ChatGPT** — proxied through the Node.js server with per-agent rolling conversation context (3-min TTL, max 5 message pairs)
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

- **Node.js** (v18+ recommended)
- An **OpenAI API key** (optional — needed for AI Query adapter)

No `npm install` required — all client dependencies (Three.js) are loaded via CDN import maps.

---

## Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mmarti8895/agent-bar-hangout.git
   cd agent-bar-hangout
   ```

2. **Create a `.env` file** (optional, for ChatGPT integration):
   ```
   OPENAI_API_KEY=your-openai-api-key-here
   ```

3. **Start the server:**
   ```bash
   node server.js
   ```

4. **Open your browser:**
   ```
   http://localhost:8080
   ```

The port defaults to `8080` and can be changed via the `PORT` environment variable.

---

## Testing

The test suite covers location extraction, weather API calls, multi-city fetches, edge cases, and ChatGPT proxy integration.

**Run the tests:**
```bash
node test-web-fetch.mjs
```

For tests that exercise the ChatGPT proxy endpoint, start the server on port 3000 first:
```bash
PORT=3000 node server.js
# In another terminal:
node test-web-fetch.mjs
```

### Test Coverage
- **18 location extraction cases** — parsing cities from natural language weather queries
- **Real weather API calls** — live requests to wttr.in
- **Multi-city fetches** — concurrent weather lookups
- **Edge cases** — bare queries, Unicode characters, malformed input
- **ChatGPT proxy** — end-to-end OpenAI API proxy integration (requires running server)

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
├── server.js               # Node.js dev server — static files + OpenAI proxy
├── test-web-fetch.mjs      # Test suite for weather/location/ChatGPT features
├── .env                    # OpenAI API key (not committed)
├── DESIGN.md               # Design specification and architecture notes
├── ASSETS.md               # Asset inventory and sourcing details
├── ASSET_IMPORT.md         # Asset import pipeline documentation
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
| **Three.js v0.170.0** | 3D scene rendering, GLTFLoader, OrbitControls |
| **Node.js (ESM)** | Development server with API proxy |
| **OpenAI API** | ChatGPT completions (gpt-4o-mini) |
| **wttr.in** | Real-time weather data |
| **GitHub REST API** | Repository, issue, and PR data |
| **Wikipedia API** | Web search fallback |
| **HTML `<dialog>`** | Native modal for MCP configuration |
| **CSS Custom Properties** | Dark cyberpunk theming |
| **ES Modules** | Client and server module system |
| **localStorage** | MCP adapter config persistence |

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
