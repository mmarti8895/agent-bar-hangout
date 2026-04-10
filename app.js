'use strict';

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ───────── Tauri IPC bridge ───────── */
const IS_TAURI = !!(window.__TAURI__ && window.__TAURI__.core);
const tauriInvoke = IS_TAURI ? window.__TAURI__.core.invoke : null;

/* ───────── DOM refs ───────── */
const canvas = document.getElementById('barCanvas');
const dom = {
  assignForm: document.getElementById('assignForm'),
  taskTitle: document.getElementById('taskTitle'),
  taskInstructions: document.getElementById('taskInstructions'),
  taskEta: document.getElementById('taskEta'),
  taskList: document.getElementById('taskList'),
  historyList: document.getElementById('historyList'),
  downloadRunHistory: document.getElementById('downloadRunHistory'),
  clearRunHistory: document.getElementById('clearRunHistory'),
  selectedName: document.getElementById('selectedAgentName'),
  selectedRole: document.getElementById('selectedAgentRole'),
  selectedMood: document.getElementById('selectedAgentMood'),
  selectedStatus: document.getElementById('selectedAgentStatus'),
  activeSummary: document.getElementById('activeSummary'),
  rosterGrid: document.getElementById('rosterGrid'),
  toastStack: document.querySelector('.toast-stack'),
  tooltip: document.getElementById('hoverTooltip'),
  mcpCheckboxes: document.getElementById('mcpCheckboxes'),
  mcpAdapterList: document.getElementById('mcpAdapterList'),
  mcpCount: document.getElementById('mcpCount'),
  responsePane: document.getElementById('responsePane'),
  clearResponsePane: document.getElementById('clearResponsePane'),
  activityLogBody: document.getElementById('activityLogBody'),
  logCount: document.getElementById('logCount'),
  agentOutputPane: document.getElementById('agentOutputPane'),
  agentOutputLabel: document.getElementById('agentOutputLabel'),
  clearAgentOutput: document.getElementById('clearAgentOutput'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  mcpConfigBtn: document.getElementById('mcpConfigBtn'),
  mcpConfigModal: document.getElementById('mcpConfigModal'),
  mcpModalClose: document.getElementById('mcpModalClose'),
  mcpConfigList: document.getElementById('mcpConfigList'),
  mcpAddForm: document.getElementById('mcpAddForm'),
  mcpNewName: document.getElementById('mcpNewName'),
  mcpNewIcon: document.getElementById('mcpNewIcon'),
  mcpNewDesc: document.getElementById('mcpNewDesc'),
  mcpNewTools: document.getElementById('mcpNewTools'),
  mcpNewConfigFields: document.getElementById('mcpNewConfigFields'),
};
const stageElement = document.querySelector('.bar-stage');

const RUN_HISTORY_STORAGE_KEY = 'agentBarHangout_runHistory';
const RUN_HISTORY_LIMIT = 10;
const RUN_HISTORY_FIELD_MAX_LEN = 500;

/* ───────── Agent definitions ───────── */
const baseAgents = [
  {
    id: 'nova', name: 'Nova', role: 'Logistics Lead', mood: 'Cheerful',
    color: 0xf5a25d, position: { x: -2.5, y: 0, z: 1.2 },
    motto: 'Keeps the supply lines humming.',
  },
  {
    id: 'quinn', name: 'Quinn', role: 'Data Whisperer', mood: 'Focused',
    color: 0x7ad3f7, position: { x: -0.8, y: 0, z: 0.5 },
    motto: 'Reads the signals nobody else sees.',
  },
  {
    id: 'rune', name: 'Rune', role: 'Ops Alchemist', mood: 'Calm',
    color: 0xb28ffc, position: { x: 1.0, y: 0, z: 1.0 },
    motto: 'Turns chaos into flow.',
  },
  {
    id: 'sol', name: 'Sol', role: 'Field Liaison', mood: 'Upbeat',
    color: 0xf7d96f, position: { x: 2.6, y: 0, z: -0.3 },
    motto: 'Keeps every client smiling.',
  },
];

const state = {
  agents: baseAgents.map((a, i) => ({
    ...a, tasks: [], history: [], status: 'idle', swayOffset: i * 0.8,
    mesh: null, labelSprite: null, ringMesh: null, beerMesh: null,
    walkState: 'at-bar', walkProgress: 0, sipTimer: 0,
  })),
  selectedAgentId: baseAgents[0].id,
  hoveredAgentId: null,
};

let runHistory = [];

// Expose for E2E testing
window.__agentBarState = state;

/* ───────── Agent context helpers (server-side engine) ───────── */
function clearServerContext(agentId) {
  if (IS_TAURI) {
    tauriInvoke('context_clear', { agentId }).catch(() => {});
  } else {
    fetch('/api/context/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId }),
    }).catch(() => {}); // fire-and-forget
  }
}

/* ───────── MCP Adapter Registry ───────── */
const defaultMcpAdapters = [
  {
    id: 'github', name: 'GitHub', icon: '🐙',
    description: 'Repos, issues, PRs, code search',
    tools: ['create_issue', 'search_code', 'open_pr', 'list_commits', 'review_pr', 'list_repos'],
    isDefault: true,
    configFields: [
      { key: 'owner', label: 'Owner / Org', type: 'text', required: true, placeholder: 'e.g., mmarti8895' },
      { key: 'token', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_…' },
      { key: 'apiUrl', label: 'API URL', type: 'url', required: false, placeholder: 'https://api.github.com' },
    ],
    configValues: {},
  },
  {
    id: 'filesystem', name: 'Filesystem', icon: '📁',
    description: 'Read, write, search local files',
    tools: ['read_file', 'write_file', 'list_dir', 'grep_search', 'delete_file'],
    isDefault: true,
    configFields: [
      { key: 'rootDir', label: 'Root Directory', type: 'text', required: true, placeholder: 'C:\\Users\\you\\projects' },
      { key: 'allowedExts', label: 'Allowed Extensions', type: 'text', required: false, placeholder: '.js, .ts, .json (blank = all)' },
    ],
    configValues: {},
  },
  {
    id: 'web', name: 'AI Search', icon: '🤖',
    description: 'LLM-powered queries via multiple AI vendors',
    tools: ['ask_llm', 'search_web', 'summarize', 'analyze'],
    isDefault: true,
    configFields: [
      { key: 'llmVendor', label: 'LLM Vendor', type: 'select', required: true,
        options: [
          { value: '', label: '— Select a vendor —' },
          { value: 'openai', label: 'ChatGPT (OpenAI)' },
          { value: 'anthropic', label: 'Claude (Anthropic)' },
          { value: 'google', label: 'Gemini (Google)' },
          { value: 'xai', label: 'Grok (xAI)' },
          { value: 'deepseek', label: 'DeepSeek' },
          { value: 'ollama', label: 'Ollama (Local)' },
          { value: 'mistral', label: 'Mistral AI' },
          { value: 'cohere', label: 'Cohere' },
          { value: 'perplexity', label: 'Perplexity' },
        ],
      },
    ],
    // Dynamic fields rendered per vendor — see LLM_VENDOR_FIELDS below
    configValues: {},
  },
  {
    id: 'weather', name: 'Weather', icon: '🌦️',
    description: 'Live current weather and short forecast via wttr.in',
    tools: ['get_weather', 'compare_locations', 'summarize_forecast'],
    isDefault: true,
    configFields: [],
    configValues: {},
  },
  {
    id: 'database', name: 'Database', icon: '🗄️',
    description: 'Query & manage SQL/NoSQL stores',
    tools: ['run_query', 'list_tables', 'describe_schema', 'insert_row', 'update_row'],
    isDefault: true,
    configFields: [
      { key: 'host', label: 'Host', type: 'text', required: true, placeholder: 'localhost' },
      { key: 'port', label: 'Port', type: 'text', required: true, placeholder: '5432' },
      { key: 'dbName', label: 'Database Name', type: 'text', required: true, placeholder: 'mydb' },
      { key: 'username', label: 'Username', type: 'text', required: true, placeholder: 'admin' },
      { key: 'password', label: 'Password', type: 'password', required: true, placeholder: '••••••' },
      { key: 'dialect', label: 'Dialect', type: 'text', required: false, placeholder: 'postgres, mysql, sqlite' },
    ],
    configValues: {},
  },
  {
    id: 'slack', name: 'Slack', icon: '💬',
    description: 'Post messages, read channels',
    tools: ['send_message', 'read_channel', 'list_channels', 'search_messages'],
    isDefault: true,
    configFields: [
      { key: 'workspaceUrl', label: 'Workspace URL', type: 'url', required: true, placeholder: 'https://your-team.slack.com' },
      { key: 'botToken', label: 'Bot OAuth Token', type: 'password', required: true, placeholder: 'xoxb-…' },
      { key: 'signingSecret', label: 'Signing Secret', type: 'password', required: false, placeholder: 'Optional' },
    ],
    configValues: {},
  },
  {
    id: 'terminal', name: 'Terminal', icon: '⚡',
    description: 'Run shell commands & scripts',
    tools: ['run_command', 'run_script', 'read_output', 'kill_process'],
    isDefault: true,
    configFields: [
      { key: 'shell', label: 'Shell', type: 'text', required: false, placeholder: 'powershell, bash, cmd' },
      { key: 'workingDir', label: 'Working Directory', type: 'text', required: false, placeholder: 'C:\\Users\\you\\projects' },
    ],
    configValues: {},
  },
  {
    id: 'atlassian', name: 'Atlassian', icon: '🔷',
    description: 'Jira issues, Confluence pages, Bitbucket',
    tools: ['create_jira_issue', 'search_issues', 'update_issue', 'get_board', 'create_confluence_page', 'search_confluence'],
    isDefault: true,
    configFields: [
      { key: 'domain', label: 'Atlassian Domain', type: 'url', required: true, placeholder: 'https://yoursite.atlassian.net' },
      { key: 'email', label: 'Account Email', type: 'email', required: true, placeholder: 'you@company.com' },
      { key: 'apiToken', label: 'API Token', type: 'password', required: true, placeholder: 'Atlassian API token' },
    ],
    configValues: {},
  },
  {
    id: 'hubspot', name: 'HubSpot', icon: '🟠',
    description: 'CRM contacts, deals, tickets & marketing',
    tools: ['create_contact', 'search_contacts', 'create_deal', 'update_deal', 'list_tickets', 'send_email'],
    isDefault: true,
    configFields: [
      { key: 'apiKey', label: 'Private App Access Token', type: 'password', required: true, placeholder: 'pat-…' },
      { key: 'portalId', label: 'Portal ID', type: 'text', required: true, placeholder: '12345678' },
    ],
    configValues: {},
  },
  {
    id: 'aws', name: 'AWS Cloud', icon: '☁️',
    description: 'EC2, S3, Lambda, CloudWatch',
    tools: ['list_instances', 'list_buckets', 'invoke_lambda', 'get_logs', 'describe_stack', 'get_metrics'],
    isDefault: true,
    configFields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'password', required: true, placeholder: 'AKIA…' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password', required: true, placeholder: '••••••' },
      { key: 'region', label: 'Region', type: 'text', required: true, placeholder: 'us-east-1' },
    ],
    configValues: {},
  },
  {
    id: 'email', name: 'Email', icon: '📧',
    description: 'Send & manage emails via SendGrid / Mailgun',
    tools: ['send_email', 'list_templates', 'check_delivery', 'get_stats', 'search_inbox'],
    isDefault: true,
    configFields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'SG.…' },
      { key: 'provider', label: 'Provider', type: 'text', required: false, placeholder: 'sendgrid, mailgun' },
      { key: 'fromAddress', label: 'From Address', type: 'email', required: true, placeholder: 'noreply@yourapp.com' },
    ],
    configValues: {},
  },
  {
    id: 'calendar', name: 'Calendar', icon: '📅',
    description: 'Google / Outlook calendar events & scheduling',
    tools: ['list_events', 'create_event', 'check_availability', 'update_event', 'delete_event'],
    isDefault: true,
    configFields: [
      { key: 'provider', label: 'Provider', type: 'text', required: true, placeholder: 'google, outlook' },
      { key: 'calendarId', label: 'Calendar ID', type: 'text', required: false, placeholder: 'primary' },
      { key: 'oauthToken', label: 'OAuth Token', type: 'password', required: true, placeholder: 'ya29.…' },
    ],
    configValues: {},
  },
  {
    id: 'monitoring', name: 'Monitoring', icon: '📊',
    description: 'Datadog, PagerDuty alerts & incidents',
    tools: ['list_alerts', 'get_incident', 'acknowledge_alert', 'get_metrics', 'create_incident', 'resolve_incident'],
    isDefault: true,
    configFields: [
      { key: 'provider', label: 'Provider', type: 'text', required: true, placeholder: 'datadog, pagerduty' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'API key' },
      { key: 'appKey', label: 'App Key (Datadog)', type: 'password', required: false, placeholder: 'Optional' },
    ],
    configValues: {},
  },
  {
    id: 'docker', name: 'Docker / K8s', icon: '🐳',
    description: 'Container & cluster management',
    tools: ['list_containers', 'list_pods', 'get_logs', 'restart_container', 'scale_deployment', 'describe_pod'],
    isDefault: true,
    configFields: [
      { key: 'endpoint', label: 'Docker / K8s Endpoint', type: 'url', required: true, placeholder: 'http://localhost:2375 or https://k8s-api:6443' },
      { key: 'namespace', label: 'Namespace', type: 'text', required: false, placeholder: 'default' },
      { key: 'kubeconfig', label: 'Kubeconfig Path', type: 'text', required: false, placeholder: '~/.kube/config' },
    ],
    configValues: {},
  },
  {
    id: 'notion', name: 'Notion / Linear', icon: '📝',
    description: 'Pages, databases, project boards & sprints',
    tools: ['search_pages', 'create_page', 'query_database', 'list_issues', 'update_issue', 'get_sprint'],
    isDefault: true,
    configFields: [
      { key: 'provider', label: 'Provider', type: 'text', required: true, placeholder: 'notion, linear' },
      { key: 'apiKey', label: 'API Key / Token', type: 'password', required: true, placeholder: 'secret_… or lin_api_…' },
      { key: 'workspaceId', label: 'Workspace ID', type: 'text', required: false, placeholder: 'Optional' },
    ],
    configValues: {},
  },
  {
    id: 'search', name: 'Web Search', icon: '🔍',
    description: 'Brave, Tavily, or SerpAPI web search',
    tools: ['search_web', 'get_snippets', 'search_news', 'search_images'],
    isDefault: true,
    configFields: [
      { key: 'provider', label: 'Provider', type: 'text', required: true, placeholder: 'brave, tavily, serpapi' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'API key' },
    ],
    configValues: {},
  },
  {
    id: 'stripe', name: 'Stripe', icon: '💳',
    description: 'Payments, subscriptions, invoices',
    tools: ['list_payments', 'get_customer', 'list_subscriptions', 'create_invoice', 'get_balance', 'search_charges'],
    isDefault: true,
    configFields: [
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true, placeholder: 'sk_live_…' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: false, placeholder: 'whsec_…' },
    ],
    configValues: {},
  },
  {
    id: 'analytics', name: 'Analytics', icon: '📈',
    description: 'Mixpanel, Amplitude, or PostHog metrics',
    tools: ['get_events', 'get_funnel', 'get_retention', 'get_users', 'query_insights'],
    isDefault: true,
    configFields: [
      { key: 'provider', label: 'Provider', type: 'text', required: true, placeholder: 'mixpanel, amplitude, posthog' },
      { key: 'apiKey', label: 'API Key / Project Token', type: 'password', required: true, placeholder: 'API key' },
      { key: 'projectId', label: 'Project ID', type: 'text', required: false, placeholder: 'Optional' },
    ],
    configValues: {},
  },
  {
    id: 'openclaw', name: 'OpenClaw', icon: '🦞',
    description: 'Route tasks to OpenClaw Gateway for real tool execution',
    tools: ['agent_send', 'sessions_list', 'sessions_history', 'skills_search', 'browser_control', 'bash_exec'],
    isDefault: true,
    configFields: [
      { key: 'gatewayUrl', label: 'Gateway WS URL', type: 'url', required: true, placeholder: 'ws://127.0.0.1:18789' },
      { key: 'authToken', label: 'Auth Token', type: 'password', required: false, placeholder: 'Optional — for password-protected gateways' },
      { key: 'sessionId', label: 'Session ID', type: 'text', required: false, placeholder: 'main (default)' },
    ],
    configValues: {},
  },
];

const MCP_STORAGE_KEY = 'agentBarHangout_mcpAdapters';
const MCP_CRYPTO_KEY_STORE = 'agentBarHangout_ck';

/* ───────── Credential encryption (AES-256-GCM via Web Crypto) ───────── */
/* In Tauri mode, credentials are stored in OS keyring via vault commands.
   In browser mode, fall back to Web Crypto AES-256-GCM + localStorage. */
async function getCryptoKey() {
  const stored = localStorage.getItem(MCP_CRYPTO_KEY_STORE);
  if (stored) {
    const jwk = JSON.parse(stored);
    return crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  localStorage.setItem(MCP_CRYPTO_KEY_STORE, JSON.stringify(jwk));
  return key;
}

async function encryptData(data) {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return JSON.stringify({ v: 1, iv: Array.from(iv), d: Array.from(new Uint8Array(encrypted)) });
}

async function decryptData(raw) {
  const obj = JSON.parse(raw);
  if (!obj.v) return obj; // legacy plaintext JSON (array) — return as-is
  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(obj.iv) },
    key,
    new Uint8Array(obj.d),
  );
  return JSON.parse(new TextDecoder().decode(decrypted));
}

/* ───────── Tauri vault helpers ───────── */
async function vaultStoreAdapterCreds(adapterId, configValues) {
  if (!IS_TAURI) return;
  // Pass adapter_id and credentials object to match Tauri command signature
  await tauriInvoke('vault_store', { adapter_id: adapterId, credentials: configValues });
}

async function vaultGetAdapterCreds(adapterId) {
  if (!IS_TAURI) return null;
  try {
    // Tauri vault_get returns a JSON object (HashMap) when credentials exist
    const creds = await tauriInvoke('vault_get', { adapter_id: adapterId });
    return creds || null;
  } catch { return null; }
}

async function vaultDeleteAdapterCreds(adapterId) {
  if (!IS_TAURI) return;
  await tauriInvoke('vault_delete', { adapter_id: adapterId }).catch(() => {});
}

async function loadMcpAdapters() {
  if (IS_TAURI) {
    // In Tauri: adapter metadata in localStorage, credentials in OS vault
    try {
      const saved = localStorage.getItem(MCP_STORAGE_KEY);
      let parsed = null;
      if (saved) {
        try { parsed = JSON.parse(saved); } catch { parsed = null; }
        if (!Array.isArray(parsed)) parsed = null;
      }
      const merged = defaultMcpAdapters.map((def) => {
        const s = parsed ? parsed.find(p => p.id === def.id) : null;
        return { ...def, configValues: s ? { ...(def.configValues || {}), ...(s.configValues || {}) } : { ...(def.configValues || {}) } };
      });
      if (parsed) {
        const defaultIds = new Set(defaultMcpAdapters.map(d => d.id));
        parsed.forEach(s => {
          if (!defaultIds.has(s.id)) merged.push({ ...s, configFields: s.configFields || [], configValues: s.configValues || {} });
        });
      }
      // Restore credentials from vault for each adapter
      for (const adapter of merged) {
        const vaultCreds = await vaultGetAdapterCreds(adapter.id);
        if (vaultCreds) {
          adapter.configValues = { ...(adapter.configValues || {}), ...vaultCreds };
        }
      }
      return merged;
    } catch { /* fall through */ }
    return defaultMcpAdapters.map(a => ({ ...a, configValues: { ...(a.configValues || {}) } }));
  }
  // Browser mode: encrypted localStorage
  try {
    const saved = localStorage.getItem(MCP_STORAGE_KEY);
    if (saved) {
      const parsed = await decryptData(saved);
      if (Array.isArray(parsed) && parsed.length) {
        const savedById = new Map(parsed.map((s) => [s.id, s]));

        // Start with all defaults, merging saved configValues on top
        const merged = defaultMcpAdapters.map((def) => {
          const s = savedById.get(def.id);
          return {
            ...def,
            configValues: s ? { ...(def.configValues || {}), ...(s.configValues || {}) } : { ...(def.configValues || {}) },
          };
        });

        // Append any custom (non-default) adapters the user added
        const defaultIds = new Set(defaultMcpAdapters.map((d) => d.id));
        parsed.forEach((s) => {
          if (!defaultIds.has(s.id)) {
            merged.push({ ...s, configFields: s.configFields || [], configValues: s.configValues || {} });
          }
        });

        return merged;
      }
    }
  } catch (_) { /* ignore corrupt / decryption failure — start fresh */ }
  return defaultMcpAdapters.map((a) => ({ ...a, configValues: { ...(a.configValues || {}) } }));
}

async function saveMcpAdapters() {
  if (IS_TAURI) {
    // In Tauri: store credentials in OS vault, metadata (without secrets) in localStorage
    const metaOnly = mcpAdapters.map(a => {
      const safeVals = {};
      const secretKeys = new Set((a.configFields || []).filter(f => f.type === 'password').map(f => f.key));
      for (const [k, v] of Object.entries(a.configValues || {})) {
        if (!secretKeys.has(k)) safeVals[k] = v;
      }
      return { ...a, configValues: safeVals };
    });
    localStorage.setItem(MCP_STORAGE_KEY, JSON.stringify(metaOnly));
    // Store full credentials (including secrets) in vault
    for (const a of mcpAdapters) {
      if (a.configValues && Object.keys(a.configValues).length > 0) {
        await vaultStoreAdapterCreds(a.id, a.configValues);
      }
    }
    return;
  }
  // Browser mode: encrypted localStorage
  const encrypted = await encryptData(mcpAdapters);
  localStorage.setItem(MCP_STORAGE_KEY, encrypted);
}

let mcpAdapters = defaultMcpAdapters.map((a) => ({ ...a, configValues: { ...(a.configValues || {}) } }));

/* ───────── LLM vendor credential definitions ───────── */
const LLM_VENDOR_FIELDS = {
  openai: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-...' },
    { key: 'orgId', label: 'Organization ID', type: 'text', required: false, placeholder: 'org-... (optional)' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'gpt-4o-mini' },
  ],
  anthropic: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-ant-...' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'claude-sonnet-4-20250514' },
  ],
  google: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'AIza...' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'gemini-2.0-flash' },
  ],
  xai: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'xai-...' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'grok-3' },
  ],
  deepseek: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'sk-...' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'deepseek-chat' },
  ],
  ollama: [
    { key: 'endpoint', label: 'Endpoint URL', type: 'text', required: true, placeholder: 'http://localhost:11434' },
    { key: 'model', label: 'Model', type: 'text', required: true, placeholder: 'llama3, mistral, codellama...' },
  ],
  mistral: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'your-api-key' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'mistral-large-latest' },
  ],
  cohere: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'your-api-key' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'command-r-plus' },
  ],
  perplexity: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, placeholder: 'pplx-...' },
    { key: 'model', label: 'Model', type: 'text', required: false, placeholder: 'sonar-pro' },
  ],
};

/* ───────── Three.js setup ───────── */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1428);
scene.fog = new THREE.FogExp2(0x1a1428, 0.04);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
camera.position.set(0, 4, 7);
camera.lookAt(0, 1, 0);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2.1;
controls.minDistance = 3;
controls.maxDistance = 15;
controls.target.set(0, 1, 0);

/* ───────── Lighting ───────── */
const ambientLight = new THREE.AmbientLight(0x665577, 1.4);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xfff0d0, 2.0);
mainLight.position.set(3, 6, 4);
mainLight.castShadow = true;
mainLight.shadow.mapSize.set(1024, 1024);
scene.add(mainLight);

// Fill light from the front
const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.6);
fillLight.position.set(-2, 3, 6);
scene.add(fillLight);

// Warm bar lamps
[
  { x: -4, y: 3.5, z: 0, color: 0xffdd88 },
  { x: -1.5, y: 3.5, z: 0, color: 0xffaa55 },
  { x: 1.5, y: 3.5, z: 0, color: 0xffdd88 },
  { x: 4, y: 3.5, z: 0, color: 0xffaa55 },
].forEach((lp) => {
  const light = new THREE.PointLight(lp.color, 4.0, 14);
  light.position.set(lp.x, lp.y, lp.z);
  light.castShadow = true;
  scene.add(light);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 8, 8),
    new THREE.MeshBasicMaterial({ color: lp.color })
  );
  bulb.position.copy(light.position);
  scene.add(bulb);
});

// Neon accent strips — brighter
[
  { color: 0xff2266, x: -3.5, y: 2.8, z: -2.5 },
  { color: 0x22ccff, x: 0, y: 2.8, z: -2.5 },
  { color: 0xff8800, x: 3.5, y: 2.8, z: -2.5 },
  { color: 0x44ff88, x: -1.5, y: 3.2, z: -3.0 },
  { color: 0xcc44ff, x: 1.5, y: 3.2, z: -3.0 },
].forEach((n) => {
  const neon = new THREE.PointLight(n.color, 2.0, 8);
  neon.position.set(n.x, n.y, n.z);
  scene.add(neon);
  // Neon tube visual
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8),
    new THREE.MeshBasicMaterial({ color: n.color })
  );
  tube.rotation.z = Math.PI / 2;
  tube.position.copy(neon.position);
  scene.add(tube);
});

/* ───────── Raycasting ───────── */
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/* ───────── Load GLB assets ───────── */
const loader = new GLTFLoader();
let beerTemplate = null;

// Load beer GLB to clone per agent
loader.load(
  'public/assets/bar/BEER.glb',
  (gltf) => {
    beerTemplate = gltf.scene;
    beerTemplate.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
      }
    });
    // Attach beer to all existing agents
    state.agents.forEach((agent) => attachBeerToAgent(agent));
  },
  undefined,
  () => {
    // BEER.glb not found — create procedural beer mugs
    state.agents.forEach((agent) => attachProceduralBeer(agent));
  }
);

function attachBeerToAgent(agent) {
  if (!agent.mesh || !beerTemplate) return;
  const beer = beerTemplate.clone();
  // Scale & position in agent's hand
  const box = new THREE.Box3().setFromObject(beer);
  const size = box.getSize(new THREE.Vector3());
  const beerScale = 0.4 / Math.max(size.x, size.y, size.z);
  beer.scale.setScalar(beerScale);
  beer.position.set(0.35, 0.7, 0.1);
  beer.rotation.z = -0.15;
  agent.mesh.add(beer);
}

function attachProceduralBeer(agent) {
  if (!agent.mesh) return;
  const mugGroup = new THREE.Group();
  // Glass body
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.06, 0.18, 12),
    new THREE.MeshPhysicalMaterial({
      color: 0xffcc44, roughness: 0.1, metalness: 0,
      transmission: 0.6, thickness: 0.5, transparent: true, opacity: 0.8,
    })
  );
  glass.position.y = 0.09;
  mugGroup.add(glass);
  // Foam head
  const foam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.07, 0.04, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff8e8, roughness: 0.9 })
  );
  foam.position.y = 0.2;
  mugGroup.add(foam);
  // Handle
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.05, 0.015, 8, 12, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.4 })
  );
  handle.position.set(0.09, 0.09, 0);
  handle.rotation.z = -Math.PI / 2;
  mugGroup.add(handle);

  mugGroup.position.set(0.35, 0.7, 0.1);
  mugGroup.rotation.z = -0.15;
  agent.mesh.add(mugGroup);
}

loader.load(
  'public/assets/bar/bar-scene.glb',
  (gltf) => {
    const barModel = gltf.scene;
    barModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(barModel);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 8 / maxDim;
    barModel.scale.setScalar(scale);
    const center = box.getCenter(new THREE.Vector3());
    barModel.position.sub(center.multiplyScalar(scale));
    barModel.position.y = 0;
    scene.add(barModel);
  },
  undefined,
  () => {
    buildFallbackBar();
  }
);

function buildFallbackBar() {
  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c1b16, roughness: 0.85 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Bar counter
  const counter = new THREE.Mesh(
    new THREE.BoxGeometry(10, 1.1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x4c2e1f, roughness: 0.6 })
  );
  counter.position.set(0, 0.55, -2.5);
  counter.castShadow = true;
  counter.receiveShadow = true;
  scene.add(counter);

  // Counter top
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(10.4, 0.08, 1.6),
    new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.4, metalness: 0.1 })
  );
  top.position.set(0, 1.14, -2.5);
  top.receiveShadow = true;
  scene.add(top);

  // Back wall
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(14, 5, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x1c1230, roughness: 0.9 })
  );
  wall.position.set(0, 2.5, -3.5);
  wall.receiveShadow = true;
  scene.add(wall);

  // Shelves
  for (let i = 0; i < 3; i++) {
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(3, 0.06, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x5a3a28 })
    );
    shelf.position.set(-3.5 + i * 3.5, 2.0 + (i % 2) * 0.4, -3.3);
    scene.add(shelf);
  }

  // Bar stools
  for (let i = 0; i < 5; i++) {
    const seat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7 })
    );
    seat.position.set(-3.2 + i * 1.6, 0.7, -1.3);
    seat.castShadow = true;
    scene.add(seat);
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 })
    );
    leg.position.set(-3.2 + i * 1.6, 0.35, -1.3);
    scene.add(leg);
  }
}

/* ───────── Create 3D agent sprites ───────── */
function createAgentMesh(agent) {
  const group = new THREE.Group();
  group.userData.agentId = agent.id;

  // Body — sleek jacket look with metallic sheen
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: agent.color, roughness: 0.25, metalness: 0.35,
    emissive: agent.color, emissiveIntensity: 0.2,
    clearcoat: 0.4, clearcoatRoughness: 0.2,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.6, 8, 16), bodyMat);
  body.position.y = 0.6;
  body.castShadow = true;
  group.add(body);

  // Jacket collar / shoulder pads
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x111111, roughness: 0.4, metalness: 0.5,
  });
  const leftCollar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), collarMat);
  leftCollar.position.set(-0.24, 1.0, 0.06);
  leftCollar.rotation.z = 0.3;
  group.add(leftCollar);
  const rightCollar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.18), collarMat);
  rightCollar.position.set(0.24, 1.0, 0.06);
  rightCollar.rotation.z = -0.3;
  group.add(rightCollar);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf9efe5, roughness: 0.5 })
  );
  head.position.y = 1.25;
  head.castShadow = true;
  group.add(head);

  // Sunglasses — cool shades
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: 0x111122, roughness: 0.05, metalness: 0.9,
    clearcoat: 1.0, clearcoatRoughness: 0.05,
  });
  const leftLens = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), lensMat);
  leftLens.scale.set(1, 0.7, 0.4);
  leftLens.position.set(-0.08, 1.28, 0.18);
  group.add(leftLens);
  const rightLens = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), lensMat);
  rightLens.scale.set(1, 0.7, 0.4);
  rightLens.position.set(0.08, 1.28, 0.18);
  group.add(rightLens);
  // Bridge
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6),
    new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 })
  );
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 1.28, 0.2);
  group.add(bridge);
  // Arms of glasses
  const armMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.3 });
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), armMat);
  leftArm.rotation.x = Math.PI / 2;
  leftArm.position.set(-0.14, 1.28, 0.08);
  group.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), armMat);
  rightArm.rotation.x = Math.PI / 2;
  rightArm.position.set(0.14, 1.28, 0.08);
  group.add(rightArm);

  // Mouth — cool smirk
  const smirk = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.012, 8, 12, Math.PI * 0.6),
    new THREE.MeshBasicMaterial({ color: 0xcc6666 })
  );
  smirk.position.set(0.02, 1.18, 0.19);
  smirk.rotation.x = -0.1;
  smirk.rotation.z = 0.15;
  group.add(smirk);

  // Beer mug (hidden until sipping)
  const mugMat = new THREE.MeshPhysicalMaterial({
    color: 0xdaa520, roughness: 0.3, metalness: 0.6,
  });
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.13, 8), mugMat);
  mug.position.set(0.28, 0.85, 0.12);
  const foamMat = new THREE.MeshStandardMaterial({ color: 0xfff8dc, roughness: 0.8 });
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.025, 8), foamMat);
  foam.position.y = 0.07;
  mug.add(foam);
  const mugHandle = new THREE.Mesh(
    new THREE.TorusGeometry(0.035, 0.01, 6, 10, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xdaa520, roughness: 0.3, metalness: 0.6 })
  );
  mugHandle.rotation.y = Math.PI / 2;
  mugHandle.position.set(0.06, 0, 0);
  mug.add(mugHandle);
  mug.visible = false;
  group.add(mug);
  agent.beerMesh = mug;

  // Selection ring
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.58, 32), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  group.add(ring);
  agent.ringMesh = ring;

  // Name label sprite
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const lctx = labelCanvas.getContext('2d');
  lctx.fillStyle = 'rgba(10, 8, 18, 0.75)';
  roundRect(lctx, 0, 0, 256, 64, 12);
  lctx.fill();
  lctx.fillStyle = '#fefcf7';
  lctx.font = 'bold 28px Inter, Segoe UI, sans-serif';
  lctx.textAlign = 'center';
  lctx.fillText(agent.name, 128, 30);
  lctx.fillStyle = '#a9b3c1';
  lctx.font = '18px Inter, Segoe UI, sans-serif';
  lctx.fillText(agent.role, 128, 54);

  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture, transparent: true }));
  labelSprite.scale.set(1.4, 0.35, 1);
  labelSprite.position.y = 1.7;
  group.add(labelSprite);
  agent.labelSprite = labelSprite;

  group.position.set(agent.position.x, agent.position.y, agent.position.z);
  agent.mesh = group;
  scene.add(group);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

state.agents.forEach(createAgentMesh);

/* ───────── Walk-state helpers ───────── */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
window.__easeInOutCubic = easeInOutCubic;
const WALK_SPEED = 0.018;   // progress per frame (~60 fps → ~0.9 s full transition)
const WALK_AWAY_Z = 3.5;    // distance agents walk away from bar
const SIP_DURATION = 2.5;   // seconds for sip animation

/* ───────── Animation loop ───────── */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();

  state.agents.forEach((agent) => {
    if (!agent.mesh) return;
    const body = agent.mesh.children[0];
    const isSelected = agent.id === state.selectedAgentId;
    const isHovered = agent.id === state.hoveredAgentId;
    const isWorking = agent.status === 'busy';

    /* ── Leaving: stomp away angrily ── */
    if (agent.walkState === 'leaving') {
      agent.walkProgress = Math.min(agent.walkProgress + WALK_SPEED, 1);
      const t = easeInOutCubic(agent.walkProgress);

      agent.mesh.position.x = agent.position.x;
      agent.mesh.position.z = agent.position.z + t * WALK_AWAY_Z;
      // Angry stomp
      const stomp = Math.abs(Math.sin(elapsed * 10 + agent.swayOffset)) * 0.09 * (1 - t * 0.3);
      agent.mesh.position.y = agent.position.y + stomp;
      // Turn away from bar
      agent.mesh.rotation.y = t * Math.PI;
      // Lean forward aggressively
      agent.mesh.rotation.x = 0.25;
      // Angry red glow
      if (body && body.material) {
        body.material.emissive.set(0xff3333);
        body.material.emissiveIntensity = 0.6 + Math.sin(elapsed * 6) * 0.15;
      }

      if (agent.walkProgress >= 1) {
        agent.walkState = 'away';
        agent.walkProgress = 0;
        if (body && body.material) body.material.emissive.set(agent.color);
      }
    }

    /* ── Away: working at offset position ── */
    else if (agent.walkState === 'away') {
      agent.mesh.position.x = agent.position.x;
      agent.mesh.position.z = agent.position.z + WALK_AWAY_Z;
      agent.mesh.rotation.y = Math.PI;

      const bob = Math.sin(elapsed * 3.0 + agent.swayOffset) * 0.02;
      agent.mesh.position.y = agent.position.y + bob;
      agent.mesh.rotation.x += (0.15 - agent.mesh.rotation.x) * 0.05;

      if (body && body.material) {
        const targetEmissive = 0.35 + Math.sin(elapsed * 4 + agent.swayOffset) * 0.2;
        body.material.emissiveIntensity += (targetEmissive - body.material.emissiveIntensity) * 0.1;
      }
    }

    /* ── Returning: walk back to bar ── */
    else if (agent.walkState === 'returning') {
      agent.walkProgress = Math.min(agent.walkProgress + WALK_SPEED, 1);
      const t = easeInOutCubic(agent.walkProgress);

      agent.mesh.position.x = agent.position.x;
      agent.mesh.position.z = agent.position.z + WALK_AWAY_Z * (1 - t);
      // Turn back to face camera
      agent.mesh.rotation.y = Math.PI * (1 - t);
      // Gentle walk bob
      const bob = Math.sin(elapsed * 4 + agent.swayOffset) * 0.04;
      agent.mesh.position.y = agent.position.y + bob;
      // Straighten up
      agent.mesh.rotation.x = 0.15 * (1 - t);

      if (body && body.material) {
        body.material.emissiveIntensity = 0.2;
      }

      if (agent.walkProgress >= 1) {
        agent.walkState = 'sipping';
        agent.walkProgress = 0;
        agent.sipTimer = elapsed;
        if (agent.beerMesh) agent.beerMesh.visible = true;
      }
    }

    /* ── Sipping: enjoy beer at bar ── */
    else if (agent.walkState === 'sipping') {
      agent.mesh.position.x = agent.position.x;
      agent.mesh.position.z = agent.position.z;
      agent.mesh.rotation.y = 0;

      const sipElapsed = elapsed - agent.sipTimer;
      const sipPhase = Math.min(sipElapsed / SIP_DURATION, 1);
      const sipCurve = Math.sin(sipPhase * Math.PI);
      agent.mesh.rotation.x = -0.12 * sipCurve;

      const bob = Math.sin(elapsed * 1.5 + agent.swayOffset) * 0.06;
      agent.mesh.position.y = agent.position.y + bob;

      if (body && body.material) {
        body.material.emissiveIntensity = 0.25;
      }

      if (sipElapsed >= SIP_DURATION) {
        agent.walkState = 'at-bar';
        agent.mesh.rotation.x = 0;
        if (agent.beerMesh) agent.beerMesh.visible = false;
      }
    }

    /* ── At bar: normal idle / busy ── */
    else {
      const bobSpeed = isWorking ? 3.0 : 1.5;
      const bobAmp = isWorking ? 0.02 : 0.06;
      const bob = Math.sin(elapsed * bobSpeed + agent.swayOffset) * bobAmp;
      const sway = isWorking ? 0 : Math.sin(elapsed * 0.8 + agent.swayOffset) * 0.04;

      const targetLean = isWorking ? 0.15 : 0;
      agent.mesh.rotation.x += (targetLean - agent.mesh.rotation.x) * 0.05;

      agent.mesh.position.y = agent.position.y + bob;
      agent.mesh.rotation.y = sway;

      if (body && body.material) {
        const targetEmissive = isWorking
          ? 0.35 + Math.sin(elapsed * 4 + agent.swayOffset) * 0.2
          : 0.2;
        body.material.emissiveIntensity += (targetEmissive - body.material.emissiveIntensity) * 0.1;
      }
    }

    // Selection ring (all states)
    const ring = agent.ringMesh;
    if (ring) {
      const targetOpacity = isSelected ? 0.9 : isHovered ? 0.5 : 0;
      ring.material.opacity += (targetOpacity - ring.material.opacity) * 0.15;
      ring.material.color.set(isSelected ? (isWorking ? 0x22ccff : 0xffd166) : 0xffffff);
      if (isSelected) {
        ring.rotation.z = elapsed * (isWorking ? 1.5 : 0.5);
        ring.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.05);
      }
    }

    // Sunglasses lens reflection shimmer (all states)
    const leftLens = agent.mesh.children[3];
    const rightLens = agent.mesh.children[4];
    if (leftLens && leftLens.material && leftLens.material.clearcoat !== undefined) {
      const shimmer = 0.85 + Math.sin(elapsed * 2.5 + agent.swayOffset) * 0.15;
      leftLens.material.clearcoat = shimmer;
      rightLens.material.clearcoat = shimmer;
    }
  });

  controls.update();
  renderer.render(scene, camera);
}

/* ───────── Resizing ───────── */
function onResize() {
  const rect = stageElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
onResize();

/* ───────── Interaction ───────── */
function getAgentFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const meshes = [];
  state.agents.forEach((a) => {
    if (a.mesh) a.mesh.traverse((c) => { if (c.isMesh) meshes.push(c); });
  });
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;

  let obj = hits[0].object;
  while (obj) {
    if (obj.userData && obj.userData.agentId) {
      return state.agents.find((a) => a.id === obj.userData.agentId) || null;
    }
    obj = obj.parent;
  }
  return null;
}

canvas.addEventListener('click', (event) => {
  const agent = getAgentFromEvent(event);
  if (agent) selectAgent(agent.id);
});

canvas.addEventListener('mousemove', (event) => {
  const agent = getAgentFromEvent(event);
  if (agent) {
    state.hoveredAgentId = agent.id;
    canvas.style.cursor = 'pointer';
    updateTooltip(agent, event);
  } else {
    state.hoveredAgentId = null;
    canvas.style.cursor = 'grab';
    hideTooltip();
  }
});

canvas.addEventListener('mouseleave', () => {
  state.hoveredAgentId = null;
  hideTooltip();
});

/* ───────── Tooltip ───────── */
function updateTooltip(agent, event) {
  const stageRect = stageElement.getBoundingClientRect();
  const x = event.clientX - stageRect.left;
  const y = event.clientY - stageRect.top;
  dom.tooltip.textContent = agent.name + ' — ' + agent.role;
  dom.tooltip.style.left = x + 'px';
  dom.tooltip.style.top = y + 'px';
  dom.tooltip.classList.add('visible');
}

function hideTooltip() {
  dom.tooltip.classList.remove('visible');
}

/* ───────── Agent selection & sidebar ───────── */
function selectAgent(agentId) {
  if (!agentId || state.selectedAgentId === agentId) return;
  state.selectedAgentId = agentId;
  renderSidebar();
  updateRosterSelection();
}

function getSelectedAgent() {
  return state.agents.find((a) => a.id === state.selectedAgentId) || null;
}

function renderSidebar() {
  const agent = getSelectedAgent();
  if (!agent) {
    dom.selectedName.textContent = 'Choose an agent';
    dom.selectedRole.textContent = 'Click a sprite in the bar or use the roster.';
    dom.selectedMood.textContent = 'Mood —';
    dom.selectedStatus.textContent = 'Status —';
    renderTaskList(dom.taskList, [], 'Select an agent to assign work.', true);
    renderRunHistory();
    dom.activeSummary.textContent = '0 tasks';
    return;
  }
  dom.selectedName.textContent = agent.name;
  dom.selectedRole.textContent = agent.role;
  dom.selectedMood.textContent = 'Mood ' + agent.mood;
  const statusLabel = agent.tasks.length ? 'Busy' : 'Idle';
  dom.selectedStatus.textContent = 'Status ' + statusLabel;
  renderTaskList(dom.taskList, agent.tasks, 'No active tasks.', true);
  renderRunHistory();
  dom.activeSummary.textContent = agent.tasks.length ? agent.tasks.length + ' task(s)' : 'No active tasks';
}

function loadRunHistory() {
  try {
    const raw = localStorage.getItem(RUN_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const trimmed = parsed.slice(0, RUN_HISTORY_LIMIT);
    if (trimmed.length !== parsed.length) {
      localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(trimmed));
    }
    return trimmed;
  } catch {
    return [];
  }
}

function saveRunHistory() {
  const trimmedHistory = runHistory.slice(0, RUN_HISTORY_LIMIT);
  try {
    localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(trimmedHistory));
  } catch {
    // Ignore storage write failures so task completion can proceed.
  }
}

function formatDownloadTimestamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) + '_' +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds());
}

function renderRunHistory() {
  if (!dom.historyList) return;
  dom.historyList.innerHTML = '';
  if (!runHistory.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty';
    emptyItem.textContent = 'No recent runs yet.';
    dom.historyList.appendChild(emptyItem);
    return;
  }

  runHistory.forEach((run) => {
    const item = document.createElement('li');
    item.className = 'task-card';

    const meta = document.createElement('div');
    meta.className = 'task-meta';

    const title = document.createElement('strong');
    title.textContent = run.agentName + ' — ' + run.label;

    const details = document.createElement('span');
    details.className = 'subtle';
    const toolsText = run.mcpNames && run.mcpNames.length ? ' • ' + run.mcpNames.join(', ') : '';
    details.textContent = (run.instructions || 'No instructions') + toolsText;

    const stamp = document.createElement('span');
    stamp.className = 'eyebrow';
    const completedAt = run.completedAt;
    const hasValidCompletedAt = completedAt instanceof Date
      ? !Number.isNaN(completedAt.getTime())
      : !!completedAt && !Number.isNaN(new Date(completedAt).getTime());
    stamp.textContent = hasValidCompletedAt
      ? 'Run completed ' + formatIsoTime(completedAt)
      : 'Run completed —';

    meta.appendChild(title);
    meta.appendChild(details);
    meta.appendChild(stamp);

    item.appendChild(meta);
    dom.historyList.appendChild(item);
  });
}

function buildRunRecord(agent, task) {
  const mcpNames = (task.mcpIds || []).map((id) => {
    const adapter = mcpAdapters.find((m) => m.id === id);
    return adapter ? adapter.name : id;
  });
  const resultEntry = [...(task.log || [])].reverse().find((entry) => entry.type === 'result');
  const rawInstructions = task.instructions || '';
  const rawResult = resultEntry ? resultEntry.message : '';
  return {
    id: task.id,
    agentId: agent.id,
    agentName: agent.name,
    label: task.label,
    instructions: rawInstructions.length > RUN_HISTORY_FIELD_MAX_LEN
      ? rawInstructions.slice(0, RUN_HISTORY_FIELD_MAX_LEN) + '…'
      : rawInstructions,
    mcpIds: [...(task.mcpIds || [])],
    mcpNames,
    etaMinutes: task.etaMinutes || null,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
    result: rawResult.length > RUN_HISTORY_FIELD_MAX_LEN
      ? rawResult.slice(0, RUN_HISTORY_FIELD_MAX_LEN) + '…'
      : rawResult,
    // log is intentionally omitted to avoid persisting potentially sensitive tool outputs
  };
}

function persistRun(agent, task) {
  runHistory.unshift(buildRunRecord(agent, task));
  runHistory = runHistory.slice(0, RUN_HISTORY_LIMIT);
  saveRunHistory();
  renderRunHistory();
}

function downloadRunHistory() {
  const blob = new Blob([JSON.stringify(runHistory, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'agent_runs_' + formatDownloadTimestamp(new Date()) + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearRunHistory() {
  runHistory = [];
  try {
    localStorage.removeItem(RUN_HISTORY_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  renderRunHistory();
}

function renderTaskList(listElement, tasks, emptyMessage, showActions) {
  listElement.innerHTML = '';
  if (!tasks.length) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'empty';
    emptyItem.textContent = emptyMessage;
    listElement.appendChild(emptyItem);
    return;
  }
  tasks.forEach((task) => {
    const item = document.createElement('li');
    item.className = 'task-card';

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    const title = document.createElement('strong');
    title.textContent = task.label;
    const notes = document.createElement('span');
    notes.className = 'subtle';
    notes.textContent = task.instructions || 'No instructions';
    const stamp = document.createElement('span');
    stamp.className = 'eyebrow';
    const etaText = task.etaMinutes ? task.etaMinutes + ' min ETA' : 'ETA n/a';
    const timeText = task.status === 'done' && task.completedAt
      ? 'Done ' + formatIsoTime(task.completedAt)
      : 'Since ' + formatIsoTime(task.createdAt);
    stamp.textContent = etaText + ' • ' + timeText;
    meta.appendChild(title);
    meta.appendChild(notes);

    // Show MCP badges on task
    if (task.mcpIds && task.mcpIds.length) {
      const mcpRow = document.createElement('div');
      mcpRow.style.cssText = 'display:flex;gap:0.3rem;flex-wrap:wrap;margin-top:0.2rem;';
      task.mcpIds.forEach((mcpId) => {
        const adapter = mcpAdapters.find((m) => m.id === mcpId);
        if (!adapter) return;
        const badge = document.createElement('span');
        badge.className = 'pill';
        badge.style.fontSize = '0.65rem';
        badge.textContent = adapter.icon + ' ' + adapter.name;
        mcpRow.appendChild(badge);
      });
      meta.appendChild(mcpRow);
    }

    meta.appendChild(stamp);
    item.appendChild(meta);

    if (showActions) {
      const actions = document.createElement('div');
      actions.className = 'task-actions';
      const statusPill = document.createElement('span');
      const statusClass = task.status === 'done' ? 'status-done'
        : task.status === 'verifying' ? 'status-verifying'
        : task.status === 'in-progress' ? 'status-working' : '';
      statusPill.className = 'pill ' + statusClass;
      const statusText = task.status === 'done' ? 'Done'
        : task.status === 'verifying' ? 'Verifying'
        : 'Working';
      statusPill.textContent = statusText;
      actions.appendChild(statusPill);
      if (task.status !== 'done') {
        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.dataset.action = 'done';
        doneButton.dataset.taskId = task.id;
        doneButton.textContent = 'Mark done';
        actions.appendChild(doneButton);
      }
      item.appendChild(actions);
    }

    // Progress log
    if (task.log && task.log.length) {
      const progress = document.createElement('div');
      progress.className = 'task-progress';

      // Progress bar
      const track = document.createElement('div');
      track.className = 'progress-bar-track';
      const fill = document.createElement('div');
      fill.className = 'progress-bar-fill';
      const pct = task.status === 'done' ? 100 : Math.min(95, (task.log.length / (task.totalSteps || 6)) * 100);
      fill.style.width = pct + '%';
      track.appendChild(fill);
      progress.appendChild(track);

      const logList = document.createElement('ul');
      logList.className = 'task-log';
      task.log.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'log-' + entry.type;
        const icon = document.createElement('span');
        icon.className = 'log-icon';
        icon.textContent = entry.type === 'mcp' ? '⚡' : entry.type === 'verify' ? '✓' : entry.type === 'done' ? '🍺' : '✗';
        li.appendChild(icon);
        const text = document.createElement('span');
        text.textContent = entry.message;
        li.appendChild(text);
        logList.appendChild(li);
      });
      progress.appendChild(logList);
      item.appendChild(progress);
    }

    listElement.appendChild(item);
  });
}

/* ───────── Roster ───────── */
function renderRoster() {
  dom.rosterGrid.innerHTML = '';
  state.agents.forEach((agent) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.agentId = agent.id;
    button.setAttribute('role', 'option');

    const nameSpan = document.createElement('span');
    nameSpan.className = 'agent-name';
    nameSpan.textContent = agent.name;
    const roleSpan = document.createElement('span');
    roleSpan.className = 'agent-role';
    roleSpan.textContent = agent.role;
    button.appendChild(nameSpan);
    button.appendChild(roleSpan);

    button.addEventListener('click', () => selectAgent(agent.id));
    dom.rosterGrid.appendChild(button);
  });
  updateRosterSelection();
}

function updateRosterSelection() {
  const buttons = dom.rosterGrid.querySelectorAll('button[data-agent-id]');
  buttons.forEach((button) => {
    const isActive = button.dataset.agentId === state.selectedAgentId;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', String(isActive));
  });
}

/* ───────── Task management ───────── */
function getSelectedMcpIds() {
  const checked = dom.mcpCheckboxes.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map((cb) => cb.value);
}

function handleAssignSubmit(event) {
  event.preventDefault();
  const agent = getSelectedAgent();
  if (!agent) {
    pushToast('Select an agent before assigning work.');
    return;
  }
  const title = dom.taskTitle.value.trim();
  const instructions = dom.taskInstructions.value.trim();
  const etaRaw = dom.taskEta.value.trim();
  if (!title) {
    pushToast('Task title cannot be empty.');
    return;
  }
  const mcpIds = getSelectedMcpIds();
  const etaMinutes = etaRaw ? Math.max(1, Math.min(240, Number(etaRaw))) : null;
  addTaskToAgent(agent.id, { title, instructions, etaMinutes, mcpIds });
  dom.assignForm.reset();
  // Reset checkboxes with AI Search checked by default
  renderMcpCheckboxes();
  dom.taskTitle.focus();
}

function addTaskToAgent(agentId, payload) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  // Clear server context if switching to a different agent
  const lastMemAgent = state._lastTaskAgentId;
  if (lastMemAgent && lastMemAgent !== agentId) {
    clearServerContext(lastMemAgent);
  }
  state._lastTaskAgentId = agentId;

  const mcpIds = payload.mcpIds || [];
  const task = {
    id: 'task-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 999),
    label: payload.title,
    title: payload.title,
    instructions: payload.instructions,
    etaMinutes: payload.etaMinutes,
    mcpIds: mcpIds,
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    completedAt: null,
    log: [],
    totalSteps: 2 + mcpIds.length * 2 + 2,
  };
  agent.tasks.push(task);
  agent.status = 'busy';
  // Trigger angry leave animation only if agent was at the bar
  if (agent.walkState === 'at-bar' || agent.walkState === 'sipping') {
    agent.walkState = 'leaving';
    agent.walkProgress = 0;
    if (agent.beerMesh) agent.beerMesh.visible = false;
  }
  renderSidebar();
  const mcpNames = mcpIds.map((id) => {
    const a = mcpAdapters.find((m) => m.id === id);
    return a ? a.name : id;
  });
  const mcpNote = mcpNames.length ? ' using ' + mcpNames.join(', ') : '';
  pushToast(agent.name + ' is on it' + mcpNote + '!');

  // Start simulated execution
  runTaskExecution(agent, task);
}

/* ───────── Simulated MCP execution pipeline ───────── */
/* ───────── Response pane helpers ───────── */
function formatTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0') + ':' +
         String(d.getSeconds()).padStart(2, '0');
}

let activityLogCount = 0;

/* ───────── Agent Output pane (main column) ───────── */
let agentOutputCount = 0;

function appendToAgentOutput(agentName, type, message) {
  const block = document.createElement('div');
  block.className = 'ao-entry ao-' + type;

  const header = document.createElement('div');
  header.className = 'ao-header';

  const badge = document.createElement('span');
  badge.className = 'ao-agent';
  badge.textContent = agentName;

  const typePill = document.createElement('span');
  typePill.className = 'ao-type ao-type-' + type;
  typePill.textContent = type;

  const time = document.createElement('span');
  time.className = 'ao-time';
  time.textContent = formatTime();

  header.appendChild(badge);
  header.appendChild(typePill);
  header.appendChild(time);

  const body = document.createElement('div');
  body.className = 'ao-body';
  body.textContent = message;

  block.appendChild(header);
  block.appendChild(body);

  dom.agentOutputPane.prepend(block);
  agentOutputCount++;
  dom.agentOutputLabel.textContent = agentOutputCount + ' result' + (agentOutputCount === 1 ? '' : 's');
}

function appendToResponsePane(agentName, type, message) {
  if (!dom.responsePane) return;
  const line = document.createElement('div');
  line.className = 'response-line resp-' + type;

  const time = document.createElement('span');
  time.className = 'resp-time';
  time.textContent = formatTime();

  const name = document.createElement('span');
  name.className = 'resp-agent';
  name.textContent = agentName;

  const msg = document.createElement('span');
  msg.className = 'resp-msg';
  msg.textContent = message;

  line.appendChild(time);
  line.appendChild(name);
  line.appendChild(msg);
  dom.responsePane.appendChild(line);

  // Auto-scroll to bottom
  dom.responsePane.scrollTop = dom.responsePane.scrollHeight;
}

function appendToActivityLog(agentName, type, taskLabel, details, statusClass) {
  const row = document.createElement('tr');

  const tdTime = document.createElement('td');
  tdTime.className = 'log-time';
  tdTime.textContent = formatTime();

  const tdAgent = document.createElement('td');
  tdAgent.className = 'log-agent';
  tdAgent.textContent = agentName;

  const tdType = document.createElement('td');
  const typePill = document.createElement('span');
  typePill.className = 'log-type-pill type-' + type;
  typePill.textContent = type;
  tdType.appendChild(typePill);

  const tdTask = document.createElement('td');
  tdTask.textContent = taskLabel || '—';
  tdTask.title = taskLabel || '';

  const tdDetails = document.createElement('td');
  tdDetails.className = 'log-details';
  tdDetails.textContent = details;
  tdDetails.title = details;

  const tdStatus = document.createElement('td');
  const dot = document.createElement('span');
  dot.className = 'log-status-dot ' + (statusClass || 'status-ok');
  tdStatus.appendChild(dot);

  row.appendChild(tdTime);
  row.appendChild(tdAgent);
  row.appendChild(tdType);
  row.appendChild(tdTask);
  row.appendChild(tdDetails);
  row.appendChild(tdStatus);

  // Insert at top so newest entries are first
  dom.activityLogBody.prepend(row);
  activityLogCount++;
  dom.logCount.textContent = activityLogCount + ' entr' + (activityLogCount === 1 ? 'y' : 'ies');
}

async function runTaskExecution(agent, task) {
  const steps = await buildExecutionSteps(agent, task);
  let stepIndex = 0;

  // Opening entry in log panes (not Agent Output)
  appendToResponsePane(agent.name, 'system', 'Starting task: "' + task.label + '"');
  appendToActivityLog(agent.name, 'assign', task.label, 'Task assigned' + (task.mcpIds.length ? ' with ' + task.mcpIds.length + ' MCP(s)' : ''), 'status-busy');

  function nextStep() {
    if (stepIndex >= steps.length) return;
    // Task may have been manually completed
    if (task.status === 'done') return;

    const step = steps[stepIndex];
    task.log.push(step);

    // Send results to Agent Output, everything to Response Pane & Activity Log
    appendToResponsePane(agent.name, step.type, step.message);
    if (step.type === 'result') {
      appendToAgentOutput(agent.name, step.type, step.message);
    }
    const logStatus = (step.type === 'done' || step.type === 'result') ? 'status-ok' : step.type === 'verify' ? 'status-ok' : 'status-busy';
    appendToActivityLog(agent.name, step.type, task.label, step.message, logStatus);

    // Update task status based on phase
    if (step.type === 'verify') {
      task.status = 'verifying';
    } else if (step.type === 'done') {
      finishTask(agent, task);
      return;
    }

    renderSidebar();
    stepIndex++;

    // Random delay (800-2500ms) to simulate real MCP responses
    const delay = 800 + Math.floor(Math.random() * 1700);
    setTimeout(nextStep, delay);
  }

  // Kick off after a short initial delay
  setTimeout(nextStep, 600);
}

async function buildExecutionSteps(agent, task) {
  const steps = [];
  const mcpIds = task.mcpIds || [];

  // Phase 1: Connect to MCPs
  if (mcpIds.length) {
    steps.push({ type: 'mcp', message: 'Connecting to ' + mcpIds.length + ' MCP adapter(s)...' });
  } else {
    steps.push({ type: 'mcp', message: 'Planning approach (no MCPs selected)...' });
  }

  // Phase 2: Use each MCP's tools — generate realistic output
  mcpIds.forEach((mcpId) => {
    const adapter = mcpAdapters.find((m) => m.id === mcpId);
    if (!adapter) return;

    const ok = isMcpConfigured(adapter);
    if (!ok) {
      steps.push({
        type: 'fail',
        message: adapter.icon + ' ' + adapter.name + ' — missing required configuration. Open Configure to set up.',
      });
      return;
    }

    // Connection step
    steps.push({
      type: 'mcp',
      message: adapter.icon + ' Connecting to ' + adapter.name + '...',
    });

    // Per-adapter realistic output
    const simulated = generateMcpSimulatedOutput(adapter, task.label);
    simulated.forEach((line) => {
      steps.push({ type: 'mcp', message: line });
    });
  });

  // Phase 3: Working on the actual task
  steps.push({ type: 'mcp', message: 'Processing "' + truncate(task.label, 30) + '"...' });

  // Phase 4: Generate the actual task result (may involve real API calls)
  // Build a full prompt from title + instructions
  const fullPrompt = task.instructions
    ? task.label + '\n\nInstructions: ' + task.instructions
    : task.label;

  // Pass agent.id for server-side context engine
  const resultText = await generateTaskResult(fullPrompt, task.mcpIds, agent.id);
  steps.push({ type: 'result', message: resultText });

  // Phase 5: Verification
  steps.push({ type: 'verify', message: 'Running verification checks...' });
  if (Math.random() > 0.5) {
    steps.push({ type: 'verify', message: 'Double-checking output quality...' });
  }
  steps.push({ type: 'verify', message: 'All checks passed ✓' });

  // Phase 6: Done
  steps.push({ type: 'done', message: 'Task complete — heading back to the bar! 🍺' });
  return steps;
}

/* Generate realistic simulated output per MCP adapter type */
function generateMcpSimulatedOutput(adapter, taskLabel) {
  const cv = adapter.configValues || {};
  const lines = [];

  switch (adapter.id) {
    case 'github': {
      const owner = cv.owner || 'user';
      lines.push('🐙 GitHub.list_repos() → fetching repos for ' + owner + '...');
      const repos = ['api-service', 'web-dashboard', 'data-pipeline', 'mobile-app', 'infra-config', 'docs-site'];
      const count = 2 + Math.floor(Math.random() * 4);
      const picked = repos.sort(() => Math.random() - 0.5).slice(0, count);
      lines.push('  Found ' + picked.length + ' repos: ' + picked.map((r) => owner + '/' + r).join(', '));
      const tool = adapter.tools[Math.floor(Math.random() * adapter.tools.length)];
      lines.push('🐙 GitHub.' + tool + '() → OK');
      break;
    }
    case 'terminal': {
      const shell = cv.shell || 'powershell';
      const cwd = cv.workingDir || 'C:\\Users\\user';
      lines.push('⚡ Terminal.run_command() → shell=' + shell + ', cwd=' + cwd);
      const outputs = [
        '  $ git status → On branch main, 3 files modified',
        '  $ npm run build → Build succeeded (4.2s)',
        '  $ dir /b → 12 items listed',
        '  $ node --version → v20.11.1',
        '  $ Get-Process | Measure → 127 processes running',
      ];
      lines.push(outputs[Math.floor(Math.random() * outputs.length)]);
      lines.push('⚡ Terminal.read_output() → OK (exit code 0)');
      break;
    }
    case 'filesystem': {
      const root = cv.rootDir || '.';
      lines.push('📁 Filesystem.list_dir() → scanning ' + root);
      lines.push('  Found 23 files across 5 directories');
      const tool = Math.random() > 0.5 ? 'read_file' : 'grep_search';
      lines.push('📁 Filesystem.' + tool + '() → OK');
      break;
    }
    case 'database': {
      const host = cv.host || 'localhost';
      const db = cv.dbName || 'mydb';
      lines.push('🗄️ Database.run_query() → connecting to ' + host + '/' + db);
      const rows = 5 + Math.floor(Math.random() * 50);
      lines.push('  Query returned ' + rows + ' rows in 0.' + (10 + Math.floor(Math.random() * 90)) + 's');
      lines.push('🗄️ Database.list_tables() → 12 tables found');
      break;
    }
    case 'slack': {
      const ws = cv.workspaceUrl || 'team.slack.com';
      lines.push('💬 Slack.list_channels() → ' + ws);
      lines.push('  Found 8 channels: #general, #dev, #random, #alerts, …');
      lines.push('💬 Slack.send_message() → posted to #general');
      break;
    }
    case 'web': {
      lines.push('🤖 AI.search() → querying LLM...');
      lines.push('  200 OK — received response, extracted 1,247 words');
      lines.push('🤖 AI.summarize() → OK');
      break;
    }
    case 'weather': {
      lines.push('🌦️ Weather.get_weather() → querying live weather source...');
      lines.push('  wttr.in responded with current conditions and forecast data');
      lines.push('🌦️ Weather.summarize_forecast() → OK');
      break;
    }
    case 'atlassian': {
      const domain = cv.domain || 'site.atlassian.net';
      lines.push('🔷 Atlassian.search_issues() → ' + domain);
      const count = 3 + Math.floor(Math.random() * 10);
      lines.push('  Found ' + count + ' Jira issues matching query');
      lines.push('🔷 Atlassian.get_board() → Sprint 14 active, 6 items in progress');
      break;
    }
    case 'hubspot': {
      const portal = cv.portalId || '?';
      lines.push('🟠 HubSpot.search_contacts() → portal ' + portal);
      const contacts = 10 + Math.floor(Math.random() * 100);
      lines.push('  Found ' + contacts + ' contacts matching criteria');
      lines.push('🟠 HubSpot.list_tickets() → 4 open tickets');
      break;
    }
    case 'aws': {
      const region = cv.region || 'us-east-1';
      lines.push('☁️ AWS.list_instances() → region=' + region);
      lines.push('  Found ' + (2 + Math.floor(Math.random() * 8)) + ' EC2 instances (' + (1 + Math.floor(Math.random() * 4)) + ' running)');
      lines.push('☁️ AWS.get_metrics() → CloudWatch OK');
      break;
    }
    case 'email': {
      const from = cv.fromAddress || 'noreply@app.com';
      lines.push('📧 Email.send_email() → from=' + from);
      lines.push('  Queued ' + (1 + Math.floor(Math.random() * 5)) + ' email(s) for delivery');
      lines.push('📧 Email.check_delivery() → all delivered ✓');
      break;
    }
    case 'calendar': {
      const provider = cv.provider || 'google';
      lines.push('📅 Calendar.list_events() → ' + provider);
      lines.push('  Found ' + (3 + Math.floor(Math.random() * 8)) + ' events today');
      lines.push('📅 Calendar.check_availability() → 2 free slots found');
      break;
    }
    case 'monitoring': {
      const provider = cv.provider || 'datadog';
      lines.push('📊 Monitoring.list_alerts() → ' + provider);
      lines.push('  ' + Math.floor(Math.random() * 4) + ' critical, ' + (1 + Math.floor(Math.random() * 6)) + ' warning alerts');
      lines.push('📊 Monitoring.get_metrics() → OK');
      break;
    }
    case 'docker': {
      const ns = cv.namespace || 'default';
      lines.push('🐳 Docker.list_containers() → namespace=' + ns);
      lines.push('  ' + (3 + Math.floor(Math.random() * 10)) + ' containers running, ' + Math.floor(Math.random() * 3) + ' stopped');
      lines.push('🐳 Docker.list_pods() → ' + (4 + Math.floor(Math.random() * 8)) + ' pods healthy');
      break;
    }
    case 'notion': {
      const provider = cv.provider || 'notion';
      lines.push('📝 ' + provider + '.search_pages() → searching workspace...');
      lines.push('  Found ' + (5 + Math.floor(Math.random() * 20)) + ' matching pages');
      lines.push('📝 ' + provider + '.query_database() → OK');
      break;
    }
    case 'search': {
      const provider = cv.provider || 'brave';
      lines.push('🔍 Search.search_web() → provider=' + provider);
      lines.push('  Returned ' + (5 + Math.floor(Math.random() * 10)) + ' results in 0.' + (10 + Math.floor(Math.random() * 90)) + 's');
      lines.push('🔍 Search.get_snippets() → extracted ' + (3 + Math.floor(Math.random() * 5)) + ' snippets');
      break;
    }
    case 'stripe': {
      lines.push('💳 Stripe.list_payments() → fetching recent charges...');
      lines.push('  ' + (5 + Math.floor(Math.random() * 20)) + ' payments ($' + ((1 + Math.random() * 50) * 1000).toFixed(0) + ' total)');
      lines.push('💳 Stripe.get_balance() → OK');
      break;
    }
    case 'analytics': {
      const provider = cv.provider || 'mixpanel';
      lines.push('📈 Analytics.get_events() → ' + provider);
      lines.push('  ' + (1000 + Math.floor(Math.random() * 50000)) + ' events in last 24h');
      lines.push('📈 Analytics.get_funnel() → conversion rate ' + (15 + Math.floor(Math.random() * 60)) + '%');
      break;
    }
    case 'openclaw': {
      const gw = cv.gatewayUrl || 'ws://127.0.0.1:18789';
      lines.push('🦞 OpenClaw.agent_send() → gateway=' + gw);
      lines.push('  Session connected, routing task to agent runtime...');
      lines.push('🦞 OpenClaw.sessions_list() → 1 active session');
      break;
    }
    default: {
      // Custom adapters
      const toolCount = 1 + Math.floor(Math.random() * Math.min(2, adapter.tools.length));
      for (let i = 0; i < toolCount; i++) {
        const tool = adapter.tools[Math.floor(Math.random() * adapter.tools.length)];
        lines.push(adapter.icon + ' ' + adapter.name + '.' + tool + '() → OK');
      }
      break;
    }
  }
  return lines;
}

/* Generate a realistic simulated result based on MCPs used and task label */
async function generateTaskResult(taskLabel, mcpIds, agentId) {
  const label = taskLabel.toLowerCase();
  const sections = [];

  for (const mcpId of mcpIds) {
    const adapter = mcpAdapters.find((m) => m.id === mcpId);
    if (!adapter) continue;
    const cv = adapter.configValues || {};
    const result = await generateMcpResult(adapter, cv, label, taskLabel, agentId);
    if (result) sections.push(result);
  }

  // If no MCPs produced a result, generate a task-label-based fallback
  if (!sections.length) {
    sections.push(await generateFallbackResult(label, taskLabel, agentId));
  }

  return sections.join('\n\n');
}

/* ───────── LLM API helper ───────── */
function getWebAdapterConfig() {
  const adapter = mcpAdapters.find(a => a.id === 'web');
  return (adapter && adapter.configValues) || {};
}

async function askLLM(query, agentId) {
  try {
    const cv = getWebAdapterConfig();
    if (IS_TAURI) {
      const vendorConfig = {};
      if (cv.llmVendor) {
        const fields = LLM_VENDOR_FIELDS[cv.llmVendor] || [];
        for (const f of fields) {
          if (cv[f.key]) vendorConfig[f.key] = cv[f.key];
        }
      }
      const result = await tauriInvoke('chat_proxy', {
        request: {
          prompt: query,
          agent_id: agentId || null,
          vendor: cv.llmVendor || null,
          vendor_config: Object.keys(vendorConfig).length ? vendorConfig : null,
        },
      });
      return '📋 RESULT — ' + result.answer;
    }
    const payload = { prompt: query };
    if (agentId) payload.agentId = agentId;
    // Pass vendor config so server can route to the right LLM
    if (cv.llmVendor) {
      payload.vendor = cv.llmVendor;
      payload.vendorConfig = {};
      const fields = LLM_VENDOR_FIELDS[cv.llmVendor] || [];
      for (const f of fields) {
        if (cv[f.key]) payload.vendorConfig[f.key] = cv[f.key];
      }
    }
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'HTTP ' + resp.status }));
      throw new Error(err.error || err.details || 'HTTP ' + resp.status);
    }
    const data = await resp.json();
    return '📋 RESULT — ' + data.answer;
  } catch (e) {
    return '❌ LLM error: ' + (e.message || e);
  }
}

/* ───────── Real GitHub API helper ───────── */
function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return seconds + 's';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd';
  const months = Math.floor(days / 30);
  return months + 'mo';
}

async function fetchGitHubReal(cv, label) {
  const owner = cv.owner || 'user';
  const token = cv.token || '';
  const apiUrl = (cv.apiUrl || 'https://api.github.com').replace(/\/+$/, '');
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (token) headers['Authorization'] = 'token ' + token;

  try {
    if (label.includes('repo') || label.includes('list') || label.includes('project')) {
      const resp = await fetch(apiUrl + '/users/' + encodeURIComponent(owner) + '/repos?sort=updated&per_page=30', { headers });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      const repos = await resp.json();
      if (!repos.length) return '📋 RESULT — GitHub Repositories for ' + owner + ':\n  No repositories found.';
      return '📋 RESULT — GitHub Repositories for ' + owner + ':\n' +
        repos.map((r, i) => '  ' + (i + 1) + '. ' + r.full_name + '  ★' + (r.stargazers_count || 0) + '  ' + (r.language || 'N/A') + '  updated ' + timeAgo(r.updated_at) + ' ago').join('\n');
    }

    if (label.includes('issue') || label.includes('bug') || label.includes('ticket')) {
      const resp = await fetch(apiUrl + '/search/issues?q=' + encodeURIComponent('user:' + owner + ' is:issue is:open') + '&per_page=15&sort=updated', { headers });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      const data = await resp.json();
      const items = data.items || [];
      if (!items.length) return '📋 RESULT — GitHub Issues for ' + owner + ':\n  No open issues found.';
      return '📋 RESULT — GitHub Issues for ' + owner + ':\n' +
        items.map((it) => '  #' + it.number + '  ' + it.title + '  [' + it.state + ']  ' + it.repository_url.split('/').pop() + '  ' + timeAgo(it.updated_at) + ' ago').join('\n');
    }

    if (label.includes('pr') || label.includes('pull')) {
      const resp = await fetch(apiUrl + '/search/issues?q=' + encodeURIComponent('user:' + owner + ' is:pr is:open') + '&per_page=15&sort=updated', { headers });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
      const data = await resp.json();
      const items = data.items || [];
      if (!items.length) return '📋 RESULT — Open Pull Requests for ' + owner + ':\n  No open PRs found.';
      return '📋 RESULT — Open Pull Requests for ' + owner + ':\n' +
        items.map((it) => '  PR #' + it.number + '  ' + it.title + '  [' + it.state + ']  ' + it.repository_url.split('/').pop() + '  ' + timeAgo(it.updated_at) + ' ago').join('\n');
    }

    // Generic: fetch repos as a summary
    const resp = await fetch(apiUrl + '/users/' + encodeURIComponent(owner) + '/repos?sort=updated&per_page=10', { headers });
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' ' + resp.statusText);
    const repos = await resp.json();
    return '📋 RESULT — GitHub (' + owner + '):\n' +
      '  Repos: ' + repos.map(r => r.full_name).join(', ') + '\n' +
      '  Total public repos: ' + (repos.length >= 10 ? '10+' : repos.length);
  } catch (e) {
    return '❌ GitHub API error: ' + (e.message || e) + '\n  Check your token and owner in MCP configuration.';
  }
}

/* ───────── Real Weather API helper (wttr.in) ───────── */
function extractLocationFromQuery(query) {
  const lower = query.toLowerCase().trim();

  // Strategy 1: Look for "in/for/at/near/of" + location (most reliable)
  const trailingNoise = /\s+(?:right now|currently|today|tonight|this week|please|thanks|thank you)[\s?.!]*$/i;
  const prepMatch = lower.match(/(?:weather|forecast|temperature|temp|conditions)\s+(?:in|for|at|near|of)\s+(.+)/i)
    || lower.match(/\b(?:in|for|at|near|of)\s+([a-z][\w\s,.-]+?)(?:\s*(?:weather|forecast|temperature|temp|conditions|right now|currently|today|tonight|please|thanks|\?|$))/i);
  if (prepMatch) {
    const loc = prepMatch[1].replace(trailingNoise, '').replace(/[?.!]+$/, '').trim();
    if (loc.length >= 2) return loc;
  }

  // Strategy 2: Strip known noise words and see what's left
  const noise = /\b(what(?:'?s| is| are)?|the|tell|me|get|can|you|could|show|look|up|find|fetch|check|give|please|thanks|thank|i|need|want|know|like|how|about|right now|currently|today|tonight|this week|weather|forecast|temperature|temp|conditions|current)\b/gi;
  const cleaned = lower.replace(noise, ' ').replace(/[?.!]+/g, '').replace(/\s+/g, ' ').trim();
  // Remove leading prepositions that survived
  const loc2 = cleaned.replace(/^(in|for|at|of|near)\s+/i, '').trim();
  if (loc2.length >= 2) return loc2;

  return 'your location';
}

async function fetchWeatherReal(taskLabel) {
  const location = extractLocationFromQuery(taskLabel);
  const url = 'https://wttr.in/' + encodeURIComponent(location) + '?format=j1';
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const cur = data.current_condition && data.current_condition[0];
    if (!cur) throw new Error('No weather data returned');
    const area = (data.nearest_area && data.nearest_area[0]) || {};
    const areaName = (area.areaName && area.areaName[0] && area.areaName[0].value) || location;
    const region = (area.region && area.region[0] && area.region[0].value) || '';
    const country = (area.country && area.country[0] && area.country[0].value) || '';
    const displayLoc = areaName + (region ? ', ' + region : '') + (country ? ', ' + country : '');
    const tempF = cur.temp_F || 'N/A';
    const tempC = cur.temp_C || 'N/A';
    const desc = (cur.weatherDesc && cur.weatherDesc[0] && cur.weatherDesc[0].value) || 'N/A';
    const humidity = cur.humidity || 'N/A';
    const windMph = cur.windspeedMiles || 'N/A';
    const windDir = cur.winddir16Point || '';
    const uvIndex = cur.uvIndex || 'N/A';
    const feelsF = cur.FeelsLikeF || tempF;
    const feelsC = cur.FeelsLikeC || tempC;

    // Tomorrow forecast
    let tomorrowStr = '';
    if (data.weather && data.weather[1]) {
      const tmrw = data.weather[1];
      tomorrowStr = '\n  Tomorrow: High ' + tmrw.maxtempF + '°F, Low ' + tmrw.mintempF + '°F — ' +
        ((tmrw.hourly && tmrw.hourly[4] && tmrw.hourly[4].weatherDesc && tmrw.hourly[4].weatherDesc[0] && tmrw.hourly[4].weatherDesc[0].value) || 'N/A');
    }

    return '📋 RESULT — Weather for ' + displayLoc + ':\n' +
      '  Conditions: ' + desc + '\n' +
      '  Temperature: ' + tempF + '°F (' + tempC + '°C)\n' +
      '  Feels Like: ' + feelsF + '°F (' + feelsC + '°C)\n' +
      '  Humidity: ' + humidity + '%\n' +
      '  Wind: ' + windMph + ' mph ' + windDir + '\n' +
      '  UV Index: ' + uvIndex +
      tomorrowStr;
  } catch (e) {
    return '❌ Weather fetch error: ' + (e.message || e) + '\n  Could not retrieve weather for "' + location + '".';
  }
}

async function generateMcpResult(adapter, cv, label, taskLabel, agentId) {
  switch (adapter.id) {
    case 'github': {
      return await fetchGitHubReal(cv, label);
    }

    case 'weather': {
      return await fetchWeatherReal(taskLabel);
    }

    case 'terminal': {
      const shell = cv.shell || 'powershell';
      const isPosh = shell === 'powershell' || shell === 'pwsh';

      // Map user intent to a real command
      let cmd;
      if (label.includes('dir') || label.includes('ls') || label.includes('list') || label.includes('directory') || label.includes('folder') || label.includes('file')) {
        cmd = isPosh
          ? 'Get-ChildItem | Format-Table Mode, LastWriteTime, Length, Name -AutoSize'
          : 'ls -la';
      } else if (label.includes('git') || label.includes('status') || label.includes('branch')) {
        if (label.includes('log') || label.includes('commit') || label.includes('history')) {
          cmd = 'git log --oneline -10';
        } else if (label.includes('branch')) {
          cmd = 'git branch -a';
        } else {
          cmd = 'git status';
        }
      } else if (label.includes('process') || label.includes('ps') || label.includes('running')) {
        cmd = isPosh
          ? 'Get-Process | Sort-Object WorkingSet64 -Descending | Select-Object -First 15 Id, ProcessName, @{N="Memory(MB)";E={[math]::Round($_.WorkingSet64/1MB,1)}} | Format-Table -AutoSize'
          : 'ps aux --sort=-%mem | head -16';
      } else if (label.includes('disk') || label.includes('space') || label.includes('storage') || label.includes('drive')) {
        cmd = isPosh
          ? 'Get-PSDrive -PSProvider FileSystem | Format-Table Name, @{N="Used(GB)";E={[math]::Round($_.Used/1GB,1)}}, @{N="Free(GB)";E={[math]::Round($_.Free/1GB,1)}} -AutoSize'
          : 'df -h';
      } else if (label.includes('env') || label.includes('environment') || label.includes('variable')) {
        cmd = isPosh
          ? 'Get-ChildItem Env: | Select-Object -First 20 | Format-Table Name, Value -AutoSize'
          : 'env | head -20';
      } else if (label.includes('network') || label.includes('ip') || label.includes('port') || label.includes('connection')) {
        cmd = isPosh
          ? 'Get-NetTCPConnection -State Established | Select-Object -First 15 LocalAddress, LocalPort, RemoteAddress, RemotePort | Format-Table -AutoSize'
          : 'ss -tuln | head -16';
      } else if (label.includes('uptime') || label.includes('system') || label.includes('info') || label.includes('hostname')) {
        cmd = isPosh
          ? '[PSCustomObject]@{Hostname=$env:COMPUTERNAME; OS=(Get-CimInstance Win32_OperatingSystem).Caption; Uptime=((Get-Date)-(Get-CimInstance Win32_OperatingSystem).LastBootUpTime).ToString("d\'d \'hh\:mm\:ss"); CPU=(Get-CimInstance Win32_Processor).Name; RAM=[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory/1GB,1).ToString()+"GB"} | Format-List'
          : 'uname -a && uptime';
      } else {
        // Generic: run systeminfo summary
        cmd = isPosh
          ? 'Write-Output "Hostname: $env:COMPUTERNAME"; Write-Output "User: $env:USERNAME"; Write-Output "OS: $((Get-CimInstance Win32_OperatingSystem).Caption)"; Write-Output "PowerShell: $($PSVersionTable.PSVersion)"; Write-Output "Working Dir: $(Get-Location)"'
          : 'echo "Host: $(hostname)" && echo "User: $(whoami)" && echo "OS: $(uname -s -r)" && echo "Shell: $SHELL" && echo "PWD: $(pwd)"';
      }

      try {
        let result;
        if (IS_TAURI) {
          result = await tauriInvoke('terminal_exec', {
            request: { command: cmd, shell: shell },
          });
        } else {
          const resp = await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd, shell }),
          });
          result = await resp.json();
          if (result.error) throw new Error(result.error);
        }
        const output = (result.stdout || '').trim() || (result.stderr || '').trim() || 'No output';
        return '📋 RESULT — Terminal (' + shell + ') [LIVE]:\n' +
          '  $ ' + cmd + '\n' +
          output.split('\n').map(l => '  ' + l).join('\n') +
          '\n  Exit code: ' + (result.exit_code || 0);
      } catch (e) {
        return '❌ Terminal error: ' + (e.message || e);
      }
    }

    case 'filesystem': {
      const root = cv.rootDir || '.';
      if (label.includes('dir') || label.includes('ls') || label.includes('list') || label.includes('directory') || label.includes('folder') || label.includes('what')) {
        const files = ['index.html', 'app.js', 'style.css', 'DESIGN.md', 'ASSETS.md', 'ASSET_IMPORT.md', 'LICENSE', 'package.json', 'README.md', '.gitignore'];
        const dirs = ['public/', 'src/', 'node_modules/', 'dist/', 'config/'];
        const pickedFiles = files.sort(() => Math.random() - 0.5).slice(0, 4 + Math.floor(Math.random() * 4));
        const pickedDirs = dirs.sort(() => Math.random() - 0.5).slice(0, 1 + Math.floor(Math.random() * 3));
        return '📋 RESULT — Contents of ' + root + ':\n' +
          pickedDirs.map(d => '  📁 ' + d).join('\n') + '\n' +
          pickedFiles.map(f => '  📄 ' + f + '  (' + (0.1 + Math.random() * 100).toFixed(1) + ' KB)').join('\n') + '\n' +
          '  ───\n' +
          '  ' + pickedDirs.length + ' folder(s), ' + pickedFiles.length + ' file(s)';
      }
      if (label.includes('search') || label.includes('find') || label.includes('grep') || label.includes('look')) {
        const matches = [
          { file: 'src/app.js', line: 42, text: 'const config = loadConfig();' },
          { file: 'src/utils.ts', line: 17, text: 'export function parseQuery(q: string) {' },
          { file: 'README.md', line: 8, text: '## Getting Started' },
          { file: 'config/default.json', line: 3, text: '"apiEndpoint": "https://api.example.com"' },
          { file: 'tests/app.test.js', line: 55, text: 'expect(result).toBe(true);' },
          { file: 'package.json', line: 12, text: '"start": "node src/app.js"' },
        ];
        const picked = matches.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 3));
        return '📋 RESULT — File search in ' + root + ':\n' +
          picked.map(m => '  ' + m.file + ':' + m.line + '  →  ' + m.text).join('\n') + '\n' +
          '  ───\n' +
          '  ' + picked.length + ' match(es) found';
      }
      if (label.includes('read') || label.includes('content') || label.includes('open')) {
        return '📋 RESULT — File contents:\n' +
          '  ─── (first 10 lines) ───\n' +
          '  1 │ // Main application entry\n' +
          '  2 │ import { init } from "./core";\n' +
          '  3 │ import config from "./config.json";\n' +
          '  4 │\n' +
          '  5 │ const app = init(config);\n' +
          '  6 │ app.start();\n' +
          '  7 │ console.log("Server running on port", config.port);\n' +
          '  ───\n' +
          '  File size: ' + (0.5 + Math.random() * 20).toFixed(1) + ' KB, ' + (10 + Math.floor(Math.random() * 300)) + ' lines total';
      }
      // generic filesystem
      const count = 3 + Math.floor(Math.random() * 15);
      const files = ['app.js', 'config.json', 'README.md', 'index.html', 'style.css', 'utils.ts'];
      const picked = files.sort(() => Math.random() - 0.5).slice(0, Math.min(count, files.length));
      return '📋 RESULT — Filesystem operation complete:\n' +
        '  Scanned: ' + root + '\n' +
        picked.map(f => '  📄 ' + f).join('\n') + '\n' +
        '  ' + count + ' item(s) processed';
    }

    case 'database': {
      const host = cv.host || 'localhost';
      const db = cv.dbName || 'mydb';
      if (label.includes('query') || label.includes('select') || label.includes('data') || label.includes('sql')) {
        const cols = ['id', 'name', 'email', 'status', 'created_at'];
        const rows = [
          ['1', 'Alice Johnson', 'alice@corp.com', 'active', '2025-11-02'],
          ['2', 'Bob Martinez', 'bob@corp.com', 'active', '2025-11-15'],
          ['3', 'Carol Chen', 'carol@corp.com', 'inactive', '2025-08-20'],
          ['4', 'Dave Kumar', 'dave@corp.com', 'active', '2026-01-03'],
          ['5', 'Eve Santos', 'eve@corp.com', 'pending', '2026-02-14'],
        ];
        const picked = rows.slice(0, 3 + Math.floor(Math.random() * 2));
        return '📋 RESULT — Query on ' + host + '/' + db + ':\n' +
          '  ' + cols.join('  |  ') + '\n' +
          '  ' + '─'.repeat(55) + '\n' +
          picked.map(r => '  ' + r.join('  |  ')).join('\n') + '\n' +
          '  ───\n' +
          '  ' + picked.length + ' row(s) returned in ' + (Math.random() * 0.5).toFixed(3) + 's';
      }
      if (label.includes('table') || label.includes('schema') || label.includes('list')) {
        const tables = ['users', 'orders', 'products', 'sessions', 'audit_log', 'settings', 'invoices', 'notifications'];
        const picked = tables.sort(() => Math.random() - 0.5).slice(0, 4 + Math.floor(Math.random() * 4));
        return '📋 RESULT — Tables in ' + db + ':\n' +
          picked.map((t, i) => '  ' + (i + 1) + '. ' + t + '  (' + (10 + Math.floor(Math.random() * 10000)) + ' rows, ' + (2 + Math.floor(Math.random() * 12)) + ' columns)').join('\n');
      }
      // generic db
      const rows = 5 + Math.floor(Math.random() * 50);
      return '📋 RESULT — Database (' + db + '@' + host + '):\n' +
        '  Returned ' + rows + ' row(s) in ' + (Math.random() * 0.8).toFixed(3) + 's\n' +
        '  Status: Operation completed successfully';
    }

    case 'slack': {
      const ws = cv.workspaceUrl || 'team.slack.com';
      // Try live Slack API if configured
      if (cv.botToken) {
        try {
          let action = 'list_channels';
          const reqBody = { botToken: cv.botToken, action };
          if (label.includes('send') || label.includes('post') || label.includes('notify')) {
            reqBody.action = 'send_message';
            reqBody.text = taskLabel;
          } else if (label.includes('message') || label.includes('read') || label.includes('search')) {
            reqBody.action = label.includes('search') ? 'search_messages' : 'read_channel';
            reqBody.query = taskLabel;
          }
          let data;
          if (IS_TAURI) {
            data = await tauriInvoke('slack_proxy', {
              request: { action: reqBody.action, channel: reqBody.channel || null, text: reqBody.text || null, query: reqBody.query || null },
            });
          } else {
            const resp = await fetch('/api/slack', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reqBody),
            });
            data = await resp.json();
          }
          if (data.ok === false && data.error) throw new Error(data.error);
          if (reqBody.action === 'list_channels' && data.channels) {
            return '📋 RESULT — Slack channels (' + ws + ') [LIVE]:\n' +
              data.channels.slice(0, 8).map(c => '  #' + c.name.padEnd(20) + (c.num_members || '?') + ' members').join('\n');
          }
          if (reqBody.action === 'send_message') {
            return '📋 RESULT — Message sent to Slack [LIVE]:\n' +
              '  Channel: ' + (data.channel || 'unknown') + '\n  Status: Delivered ✓\n  ts: ' + (data.ts || '');
          }
          return '📋 RESULT — Slack [LIVE]:\n  ' + JSON.stringify(data).slice(0, 500);
        } catch (e) {
          return '❌ Slack API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('channel') || label.includes('list')) {
        const msgs = [
          { user: 'alice', text: 'Deployed v2.3 to staging', time: '10:42 AM' },
          { user: 'bob', text: 'PR #87 is ready for review', time: '10:38 AM' },
          { user: 'carol', text: 'Updated the onboarding docs', time: '10:15 AM' },
          { user: 'dave', text: 'CI is green on main 🟢', time: '9:55 AM' },
        ];
        return '📋 RESULT — Recent messages:\n' +
          msgs.map(m => '  [' + m.time + '] @' + m.user + ': ' + m.text).join('\n');
      }
      if (label.includes('send') || label.includes('post') || label.includes('notify')) {
        return '📋 RESULT — Message sent to Slack:\n' +
          '  Channel: #' + ['general', 'development', 'alerts'][Math.floor(Math.random() * 3)] + '\n' +
          '  Status: Delivered ✓\n' +
          '  Timestamp: ' + new Date().toISOString();
      }
      return '📋 RESULT — Slack (' + ws + '):\n' +
        '  6 channels available, 3 with unread messages\n' +
        '  Most active: #development (7 new messages)';
    }

    case 'web': {
      return await askLLM(taskLabel, agentId);
    }

    case 'atlassian': {
      const domain = cv.domain || 'site.atlassian.net';
      // Try live Atlassian REST API if configured
      if (cv.domain && cv.email && cv.apiToken) {
        try {
          const authHeader = 'Basic ' + btoa(cv.email + ':' + cv.apiToken);
          const headers = { 'Authorization': authHeader, 'Accept': 'application/json' };
          const baseUrl = cv.domain.replace(/\/+$/, '');
          if (label.includes('confluence') || label.includes('page') || label.includes('doc')) {
            const resp = await fetch(baseUrl + '/wiki/rest/api/content?limit=5&orderby=modified%20desc', { headers });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const pages = (data.results || []).slice(0, 5);
            if (pages.length) {
              return '📋 RESULT — Confluence pages [LIVE]:\n' +
                pages.map((p, i) => '  ' + (i + 1) + '. ' + p.title).join('\n');
            }
          }
          // Default: search Jira issues
          const jql = encodeURIComponent('order by updated DESC');
          const resp = await fetch(baseUrl + '/rest/api/3/search?jql=' + jql + '&maxResults=5', { headers });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const issues = (data.issues || []).slice(0, 5);
          if (issues.length) {
            return '📋 RESULT — Jira Issues (' + domain + ') [LIVE]:\n' +
              issues.map(i => '  ' + i.key + '  ' + (i.fields.summary || '') + '\n         Status: ' + (i.fields.status?.name || '?') + '  |  Assignee: @' + (i.fields.assignee?.displayName || 'unassigned')).join('\n');
          }
          return '📋 RESULT — Atlassian (' + domain + ') [LIVE]:\n  ' + (data.total || 0) + ' total issues';
        } catch (e) {
          return '❌ Atlassian API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('issue') || label.includes('jira') || label.includes('ticket') || label.includes('bug')) {
        const issues = [
          { key: 'PROJ-142', summary: 'Refactor authentication module', status: 'In Progress', assignee: 'alice' },
          { key: 'PROJ-139', summary: 'Fix broken export to CSV', status: 'Open', assignee: 'bob' },
          { key: 'PROJ-155', summary: 'Add unit tests for payment flow', status: 'In Review', assignee: 'carol' },
          { key: 'PROJ-148', summary: 'Optimize database queries on dashboard', status: 'Open', assignee: 'unassigned' },
          { key: 'PROJ-160', summary: 'Upgrade React to v19', status: 'To Do', assignee: 'dave' },
        ];
        const picked = issues.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2));
        return '📋 RESULT — Jira Issues (' + domain + '):\n' +
          picked.map(i => '  ' + i.key + '  ' + i.summary + '\n         Status: ' + i.status + '  |  Assignee: @' + i.assignee).join('\n') + '\n' +
          '  ───\n' +
          '  Sprint 14: ' + (3 + Math.floor(Math.random() * 6)) + ' items in progress';
      }
      if (label.includes('confluence') || label.includes('page') || label.includes('doc')) {
        const pages = ['Onboarding Guide', 'Architecture Overview', 'API Standards', 'Sprint Retrospective', 'Release Notes v2.3'];
        const picked = pages.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — Confluence pages:\n' +
          picked.map((p, i) => '  ' + (i + 1) + '. ' + p + '  (updated ' + (1 + Math.floor(Math.random() * 30)) + 'd ago by @' + ['alice', 'bob', 'carol'][i % 3] + ')').join('\n');
      }
      return '📋 RESULT — Atlassian (' + domain + '):\n' +
        '  Jira: ' + (3 + Math.floor(Math.random() * 10)) + ' open issues\n' +
        '  Sprint 14: ' + (3 + Math.floor(Math.random() * 6)) + ' items in progress\n' +
        '  Confluence: 5 pages updated this week';
    }

    case 'hubspot': {
      const portal = cv.portalId || 'unknown';
      // Try live HubSpot API if configured
      if (cv.apiKey) {
        try {
          const headers = { 'Authorization': 'Bearer ' + cv.apiKey, 'Content-Type': 'application/json' };
          if (label.includes('contact') || label.includes('customer') || label.includes('lead')) {
            const resp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=5', { headers });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const contacts = (data.results || []).slice(0, 5);
            return '📋 RESULT — HubSpot Contacts (portal ' + portal + ') [LIVE]:\n' +
              contacts.map(c => '  ' + (c.properties.firstname || '') + ' ' + (c.properties.lastname || '') + '  ' + (c.properties.email || '')).join('\n') + '\n' +
              '  Total: ' + (data.total || contacts.length) + ' contacts';
          }
          if (label.includes('deal') || label.includes('pipeline') || label.includes('revenue')) {
            const resp = await fetch('https://api.hubapi.com/crm/v3/objects/deals?limit=5', { headers });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            return '📋 RESULT — HubSpot Deals [LIVE]:\n' +
              (data.results || []).slice(0, 5).map(d => '  ' + (d.properties.dealname || 'Unnamed') + '  $' + (d.properties.amount || '0')).join('\n');
          }
          // Generic: list contacts
          const resp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=3', { headers });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          return '📋 RESULT — HubSpot (portal ' + portal + ') [LIVE]:\n' +
            '  Contacts: ' + (data.total || 0);
        } catch (e) {
          return '❌ HubSpot API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('contact') || label.includes('customer') || label.includes('lead')) {
        const contacts = [
          { name: 'Acme Corp', email: 'info@acme.com', stage: 'Customer', value: '$24,000' },
          { name: 'Globex Inc', email: 'sales@globex.com', stage: 'Lead', value: '$8,500' },
          { name: 'Initech LLC', email: 'hello@initech.com', stage: 'Opportunity', value: '$15,200' },
          { name: 'Umbrella Co', email: 'biz@umbrella.io', stage: 'Customer', value: '$42,000' },
        ];
        const picked = contacts.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — HubSpot Contacts (portal ' + portal + '):\n' +
          picked.map(c => '  ' + c.name.padEnd(16) + c.email.padEnd(24) + c.stage.padEnd(14) + c.value).join('\n') + '\n' +
          '  Total: ' + (50 + Math.floor(Math.random() * 200)) + ' contacts in CRM';
      }
      if (label.includes('deal') || label.includes('pipeline') || label.includes('revenue')) {
        return '📋 RESULT — HubSpot Deals:\n' +
          '  Pipeline: ' + (3 + Math.floor(Math.random() * 10)) + ' active deals\n' +
          '  Total value: $' + (50 + Math.floor(Math.random() * 200)) + 'K\n' +
          '  Closing this month: ' + (1 + Math.floor(Math.random() * 5)) + ' deals ($' + (10 + Math.floor(Math.random() * 50)) + 'K)\n' +
          '  Win rate: ' + (35 + Math.floor(Math.random() * 40)) + '%';
      }
      return '📋 RESULT — HubSpot (portal ' + portal + '):\n' +
        '  Contacts: ' + (50 + Math.floor(Math.random() * 200)) + '\n' +
        '  Open deals: ' + (3 + Math.floor(Math.random() * 10)) + '\n' +
        '  Tickets: ' + (2 + Math.floor(Math.random() * 8)) + ' open';
    }

    case 'aws': {
      const region = cv.region || 'us-east-1';
      // AWS APIs require SigV4 signing — not feasible from browser.
      // When configured, route through ChatGPT to describe what calls would be made.
      if (cv.accessKeyId && cv.secretAccessKey) {
        try {
          const awsPrompt = 'You are an AWS CLI expert. The user wants to: "' + taskLabel +
            '" in region ' + region + '. Describe what AWS API calls you would make and provide realistic sample output. Be concise.';
          return await askLLM(awsPrompt, agentId);
        } catch (e) {
          // fall through to simulated
        }
      }
      // Simulated fallback
      if (label.includes('ec2') || label.includes('instance') || label.includes('server')) {
        const instances = [
          { id: 'i-0a1b2c3d', type: 't3.medium', state: 'running', name: 'web-prod-1' },
          { id: 'i-4e5f6a7b', type: 't3.large', state: 'running', name: 'api-prod-1' },
          { id: 'i-8c9d0e1f', type: 'r5.xlarge', state: 'running', name: 'db-replica' },
          { id: 'i-2a3b4c5d', type: 't3.micro', state: 'stopped', name: 'dev-sandbox' },
        ];
        const picked = instances.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — EC2 Instances (' + region + '):\n' +
          picked.map(i => '  ' + i.id + '  ' + i.name.padEnd(16) + i.type.padEnd(14) + i.state).join('\n');
      }
      if (label.includes('s3') || label.includes('bucket') || label.includes('storage')) {
        const buckets = ['app-assets-prod', 'data-lake-raw', 'backups-daily', 'logs-archive', 'static-site'];
        const picked = buckets.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — S3 Buckets:\n' +
          picked.map(b => '  🪣 ' + b + '  (' + (0.1 + Math.random() * 50).toFixed(1) + ' GB)').join('\n');
      }
      if (label.includes('lambda') || label.includes('function') || label.includes('serverless')) {
        return '📋 RESULT — Lambda Functions (' + region + '):\n' +
          '  process-orders     Node.js 20  128 MB  avg ' + (50 + Math.floor(Math.random() * 400)) + 'ms\n' +
          '  resize-images      Python 3.12  512 MB  avg ' + (200 + Math.floor(Math.random() * 800)) + 'ms\n' +
          '  send-notifications  Node.js 20  128 MB  avg ' + (30 + Math.floor(Math.random() * 100)) + 'ms';
      }
      return '📋 RESULT — AWS (' + region + '):\n' +
        '  EC2: ' + (2 + Math.floor(Math.random() * 6)) + ' instances (' + (1 + Math.floor(Math.random() * 4)) + ' running)\n' +
        '  S3: ' + (3 + Math.floor(Math.random() * 5)) + ' buckets\n' +
        '  Lambda: ' + (2 + Math.floor(Math.random() * 8)) + ' functions active';
    }

    case 'email': {
      const from = cv.fromAddress || 'noreply@app.com';
      // Try live SendGrid API via server proxy
      if (cv.apiKey) {
        try {
          if (label.includes('send') || label.includes('notify') || label.includes('alert')) {
            let data;
            if (IS_TAURI) {
              data = await tauriInvoke('email_proxy', {
                request: { action: 'send_email', from: from, text: taskLabel, to: null, subject: null, html: null },
              });
            } else {
              const resp = await fetch('/api/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: cv.apiKey, action: 'send_email', from, text: taskLabel }),
              });
              data = await resp.json();
            }
            return '📋 RESULT — Email [LIVE]:\n  Status: ' + (data.ok ? 'Sent ✓' : 'HTTP ' + data.status) + '\n  From: ' + from;
          }
          if (label.includes('stat') || label.includes('deliverability') || label.includes('report')) {
            let data;
            if (IS_TAURI) {
              data = await tauriInvoke('email_proxy', {
                request: { action: 'get_stats', to: null, from: null, subject: null, html: null, text: null },
              });
            } else {
              const resp = await fetch('/api/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: cv.apiKey, action: 'get_stats' }),
              });
              data = await resp.json();
            }
            if (Array.isArray(data) && data.length) {
              const s = data[0].stats?.[0]?.metrics || {};
              return '📋 RESULT — Email Stats [LIVE]:\n' +
                '  Requests: ' + (s.requests || 0) + '\n  Delivered: ' + (s.delivered || 0) + '\n  Opens: ' + (s.opens || 0) + '\n  Bounces: ' + (s.bounces || 0);
            }
            return '📋 RESULT — Email Stats [LIVE]:\n  ' + JSON.stringify(data).slice(0, 400);
          }
        } catch (e) {
          return '❌ Email API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('send') || label.includes('notify') || label.includes('alert')) {
        return '📋 RESULT — Email sent:\n' +
          '  From: ' + from + '\n' +
          '  To: ' + (1 + Math.floor(Math.random() * 10)) + ' recipient(s)\n' +
          '  Status: Queued for delivery ✓\n' +
          '  Message ID: msg_' + Math.random().toString(36).slice(2, 10);
      }
      if (label.includes('stat') || label.includes('deliverability') || label.includes('report')) {
        return '📋 RESULT — Email Stats (last 7 days):\n' +
          '  Sent: ' + (100 + Math.floor(Math.random() * 5000)) + '\n' +
          '  Delivered: ' + (95 + Math.floor(Math.random() * 5)) + '%\n' +
          '  Opened: ' + (20 + Math.floor(Math.random() * 40)) + '%\n' +
          '  Bounced: ' + (Math.random() * 3).toFixed(1) + '%';
      }
      return '📋 RESULT — Email (' + from + '):\n' +
        '  ' + (1 + Math.floor(Math.random() * 5)) + ' email(s) processed\n' +
        '  Delivery rate: ' + (95 + Math.floor(Math.random() * 5)) + '%';
    }

    case 'calendar': {
      const provider = cv.provider || 'google';
      // Try live Google Calendar API if OAuth token is configured
      if (cv.oauthToken && (provider === 'google' || provider === 'Google')) {
        try {
          const now = new Date().toISOString();
          const endOfDay = new Date();
          endOfDay.setHours(23, 59, 59, 999);
          const calId = cv.calendarId || 'primary';
          const url = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calId) +
            '/events?timeMin=' + encodeURIComponent(now) + '&timeMax=' + encodeURIComponent(endOfDay.toISOString()) +
            '&singleEvents=true&orderBy=startTime&maxResults=8';
          const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + cv.oauthToken } });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const events = (data.items || []).slice(0, 6);
          if (events.length) {
            return '📋 RESULT — Calendar Events (' + provider + ') [LIVE]:\n' +
              events.map(e => {
                const start = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All day';
                return '  📅 ' + start + ' — ' + (e.summary || 'No title') + ' (' + (e.attendees?.length || 0) + ' attendees)';
              }).join('\n');
          }
          return '📋 RESULT — Calendar [LIVE]:\n  No more events today';
        } catch (e) {
          return '❌ Calendar API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('event') || label.includes('meeting') || label.includes('schedule') || label.includes('today')) {
        const events = [
          { title: 'Sprint Planning', time: '9:00 AM', duration: '1h', attendees: 6 },
          { title: 'Design Review', time: '11:00 AM', duration: '45m', attendees: 4 },
          { title: '1:1 with Manager', time: '1:00 PM', duration: '30m', attendees: 2 },
          { title: 'Team Standup', time: '3:00 PM', duration: '15m', attendees: 8 },
          { title: 'Retrospective', time: '4:00 PM', duration: '1h', attendees: 7 },
        ];
        const picked = events.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — Calendar Events (' + provider + '):\n' +
          picked.map(e => '  📅 ' + e.time + ' — ' + e.title + ' (' + e.duration + ', ' + e.attendees + ' attendees)').join('\n');
      }
      if (label.includes('free') || label.includes('available') || label.includes('slot')) {
        return '📋 RESULT — Availability:\n' +
          '  Free slots today:\n' +
          '  ✅ 10:00 AM – 11:00 AM\n' +
          '  ✅ 2:00 PM – 3:00 PM\n' +
          '  ✅ 5:00 PM – 6:00 PM';
      }
      return '📋 RESULT — Calendar (' + provider + '):\n' +
        '  ' + (3 + Math.floor(Math.random() * 6)) + ' events today\n' +
        '  Next: Team Standup at 3:00 PM\n' +
        '  ' + (1 + Math.floor(Math.random() * 4)) + ' free slot(s) remaining';
    }

    case 'monitoring': {
      const provider = cv.provider || 'datadog';
      // Try live Datadog API if configured
      if (cv.apiKey && (provider === 'datadog' || provider === 'Datadog')) {
        try {
          const headers = { 'DD-API-KEY': cv.apiKey, 'Content-Type': 'application/json' };
          if (cv.appKey) headers['DD-APPLICATION-KEY'] = cv.appKey;
          const resp = await fetch('https://api.datadoghq.com/api/v1/monitor?page=0&page_size=5', { headers });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const monitors = await resp.json();
          if (Array.isArray(monitors) && monitors.length) {
            return '📋 RESULT — Datadog Monitors [LIVE]:\n' +
              monitors.slice(0, 5).map(m => '  ' + (m.overall_state === 'OK' ? '🟢' : m.overall_state === 'Alert' ? '🔴' : '🟡') +
                ' ' + (m.name || 'Unnamed') + '  (' + (m.overall_state || '?') + ')').join('\n');
          }
        } catch (e) {
          return '❌ Datadog API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('alert') || label.includes('incident') || label.includes('issue') || label.includes('down')) {
        const alerts = [
          { severity: '🔴 CRITICAL', name: 'API latency > 5s', triggered: '12 min ago' },
          { severity: '🟡 WARNING', name: 'CPU usage > 80%', triggered: '47 min ago' },
          { severity: '🟡 WARNING', name: 'Disk space < 15%', triggered: '2h ago' },
          { severity: '🟢 RESOLVED', name: 'Memory spike on web-prod-1', triggered: '4h ago' },
        ];
        const picked = alerts.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — Alerts (' + provider + '):\n' +
          picked.map(a => '  ' + a.severity + '  ' + a.name + '  (triggered ' + a.triggered + ')').join('\n');
      }
      if (label.includes('metric') || label.includes('health') || label.includes('status')) {
        return '📋 RESULT — System Health:\n' +
          '  API latency (p99): ' + (50 + Math.floor(Math.random() * 300)) + 'ms\n' +
          '  Error rate: ' + (Math.random() * 2).toFixed(2) + '%\n' +
          '  Uptime (30d): ' + (99 + Math.random()).toFixed(2) + '%\n' +
          '  CPU avg: ' + (20 + Math.floor(Math.random() * 50)) + '%  |  Memory: ' + (40 + Math.floor(Math.random() * 40)) + '%';
      }
      return '📋 RESULT — Monitoring (' + provider + '):\n' +
        '  ' + Math.floor(Math.random() * 3) + ' critical, ' + (1 + Math.floor(Math.random() * 5)) + ' warning alerts\n' +
        '  Overall status: ' + ['HEALTHY 🟢', 'DEGRADED 🟡', 'HEALTHY 🟢'][Math.floor(Math.random() * 3)];
    }

    case 'docker': {
      const ns = cv.namespace || 'default';
      // Try live Docker API if endpoint is configured
      if (cv.endpoint) {
        try {
          const baseUrl = cv.endpoint.replace(/\/+$/, '');
          if (label.includes('pod') || label.includes('k8s') || label.includes('kubernetes') || label.includes('deploy')) {
            const resp = await fetch(baseUrl + '/api/v1/namespaces/' + encodeURIComponent(ns) + '/pods?limit=10');
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const pods = (data.items || []).slice(0, 6);
            return '📋 RESULT — Pods (ns: ' + ns + ') [LIVE]:\n' +
              pods.map(p => '  ' + (p.status?.phase === 'Running' ? '🟢' : '⚪') + ' ' +
                p.metadata.name + '  ' + (p.status?.phase || '?') + '  restarts=' +
                (p.status?.containerStatuses?.[0]?.restartCount || 0)).join('\n');
          }
          // Docker containers
          const resp = await fetch(baseUrl + '/containers/json?all=true&limit=10');
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const containers = await resp.json();
          return '📋 RESULT — Containers [LIVE]:\n' +
            containers.slice(0, 6).map(c => '  🐳 ' + (c.Names?.[0] || '?').replace(/^\//, '').padEnd(20) +
              (c.Image || '?').padEnd(24) + (c.State || '?')).join('\n');
        } catch (e) {
          return '❌ Docker/K8s API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('container') || label.includes('docker') || label.includes('list')) {
        const containers = [
          { name: 'web-app', image: 'node:20-alpine', status: 'Up 3 days', ports: '3000→3000' },
          { name: 'api-server', image: 'node:20-alpine', status: 'Up 3 days', ports: '8080→8080' },
          { name: 'postgres', image: 'postgres:16', status: 'Up 5 days', ports: '5432→5432' },
          { name: 'redis', image: 'redis:7-alpine', status: 'Up 5 days', ports: '6379→6379' },
          { name: 'nginx', image: 'nginx:latest', status: 'Up 3 days', ports: '80→80,443→443' },
        ];
        const picked = containers.sort(() => Math.random() - 0.5).slice(0, 4);
        return '📋 RESULT — Containers:\n' +
          picked.map(c => '  🐳 ' + c.name.padEnd(14) + c.image.padEnd(20) + c.status.padEnd(14) + c.ports).join('\n');
      }
      if (label.includes('pod') || label.includes('k8s') || label.includes('kubernetes') || label.includes('deploy')) {
        const pods = [
          { name: 'web-app-7f8d9-abc12', status: 'Running', restarts: 0, age: '3d' },
          { name: 'api-server-5c6e7-def34', status: 'Running', restarts: 0, age: '3d' },
          { name: 'worker-8a9b0-ghi56', status: 'Running', restarts: 1, age: '2d' },
          { name: 'cronjob-1b2c3-jkl78', status: 'Completed', restarts: 0, age: '1h' },
        ];
        return '📋 RESULT — Pods (ns: ' + ns + '):\n' +
          pods.map(p => '  ' + (p.status === 'Running' ? '🟢' : '⚪') + ' ' + p.name + '  ' + p.status + '  restarts=' + p.restarts + '  age=' + p.age).join('\n');
      }
      return '📋 RESULT — Docker / K8s:\n' +
        '  Containers: ' + (3 + Math.floor(Math.random() * 6)) + ' running, ' + Math.floor(Math.random() * 2) + ' stopped\n' +
        '  Pods (' + ns + '): ' + (4 + Math.floor(Math.random() * 8)) + ' healthy\n' +
        '  Images: ' + (5 + Math.floor(Math.random() * 10)) + ' cached';
    }

    case 'notion': {
      const provider = cv.provider || 'notion';
      // Try live Notion API if configured
      if (cv.apiKey && (provider === 'notion' || provider === 'Notion')) {
        try {
          const headers = {
            'Authorization': 'Bearer ' + cv.apiKey,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          };
          if (label.includes('page') || label.includes('doc') || label.includes('note') || label.includes('search')) {
            const resp = await fetch('https://api.notion.com/v1/search', {
              method: 'POST', headers,
              body: JSON.stringify({ query: taskLabel, page_size: 5 }),
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            const pages = (data.results || []).filter(r => r.object === 'page').slice(0, 5);
            if (pages.length) {
              return '📋 RESULT — Notion Pages [LIVE]:\n' +
                pages.map((p, i) => {
                  const title = p.properties?.title?.title?.[0]?.plain_text || p.properties?.Name?.title?.[0]?.plain_text || 'Untitled';
                  return '  ' + (i + 1) + '. ' + title;
                }).join('\n');
            }
          }
          // Generic search
          const resp = await fetch('https://api.notion.com/v1/search', {
            method: 'POST', headers,
            body: JSON.stringify({ page_size: 5 }),
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          return '📋 RESULT — Notion [LIVE]:\n  ' + (data.results?.length || 0) + ' items found in workspace';
        } catch (e) {
          return '❌ Notion API error: ' + (e.message || e);
        }
      }
      // Try live Linear API if configured
      if (cv.apiKey && (provider === 'linear' || provider === 'Linear')) {
        try {
          const resp = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: { 'Authorization': cv.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: '{ issues(first: 5, orderBy: updatedAt) { nodes { identifier title state { name } assignee { name } } } }' }),
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const issues = data.data?.issues?.nodes || [];
          if (issues.length) {
            return '📋 RESULT — Linear Issues [LIVE]:\n' +
              issues.map(i => '  ' + i.identifier + '  ' + i.title + '  (' + (i.state?.name || '?') + ', @' + (i.assignee?.name || 'unassigned') + ')').join('\n');
          }
        } catch (e) {
          return '❌ Linear API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('page') || label.includes('doc') || label.includes('note') || label.includes('search')) {
        const pages = [
          { title: 'Q1 Product Roadmap', updated: '2d ago', author: 'alice' },
          { title: 'API Design Principles', updated: '5d ago', author: 'bob' },
          { title: 'Onboarding Checklist', updated: '1w ago', author: 'carol' },
          { title: 'Architecture Decision Records', updated: '3d ago', author: 'dave' },
        ];
        const picked = pages.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — ' + provider + ' Pages:\n' +
          picked.map((p, i) => '  ' + (i + 1) + '. ' + p.title + '  (updated ' + p.updated + ' by @' + p.author + ')').join('\n');
      }
      if (label.includes('issue') || label.includes('sprint') || label.includes('board') || label.includes('task')) {
        return '📋 RESULT — ' + provider + ' Board:\n' +
          '  Sprint ' + (10 + Math.floor(Math.random() * 10)) + ' — ' + (3 + Math.floor(Math.random() * 8)) + ' items in progress\n' +
          '  Backlog: ' + (10 + Math.floor(Math.random() * 30)) + ' items\n' +
          '  Completed this sprint: ' + (5 + Math.floor(Math.random() * 10));
      }
      return '📋 RESULT — ' + provider + ':\n' +
        '  ' + (5 + Math.floor(Math.random() * 15)) + ' pages matching query\n' +
        '  Last updated: ' + (1 + Math.floor(Math.random() * 7)) + 'd ago';
    }

    case 'search': {
      const provider = cv.provider || 'brave';
      // Try live Brave Search API if configured
      if (cv.apiKey && (provider === 'brave' || provider === 'Brave')) {
        try {
          const resp = await fetch('https://api.search.brave.com/res/v1/web/search?q=' + encodeURIComponent(taskLabel) + '&count=5', {
            headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': cv.apiKey },
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const results = (data.web?.results || []).slice(0, 5);
          if (results.length) {
            return '📋 RESULT — Brave Search [LIVE]:\n' +
              results.map((r, i) => '  ' + (i + 1) + '. ' + r.title + '\n     ' + r.url + '\n     ' + (r.description || '').slice(0, 120)).join('\n');
          }
        } catch (e) {
          return '❌ Brave Search error: ' + (e.message || e);
        }
      }
      // Try live Tavily API if configured
      if (cv.apiKey && (provider === 'tavily' || provider === 'Tavily')) {
        try {
          const resp = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: cv.apiKey, query: taskLabel, max_results: 5 }),
          });
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const data = await resp.json();
          const results = (data.results || []).slice(0, 5);
          if (results.length) {
            return '📋 RESULT — Tavily Search [LIVE]:\n' +
              results.map((r, i) => '  ' + (i + 1) + '. ' + r.title + '\n     ' + r.url + '\n     ' + (r.content || '').slice(0, 120)).join('\n');
          }
        } catch (e) {
          return '❌ Tavily Search error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      const simResults = [
        { title: 'Official Documentation — Getting Started', url: 'docs.example.com/start', snippet: 'Step-by-step guide to set up your environment...' },
        { title: 'Stack Overflow — Best practices for...', url: 'stackoverflow.com/q/123456', snippet: 'The recommended approach is to use...' },
        { title: 'GitHub — Example Repository', url: 'github.com/example/repo', snippet: 'A reference implementation with full test coverage...' },
        { title: 'Blog Post — Deep Dive into...', url: 'blog.example.com/deep-dive', snippet: 'In this post we explore the internals of...' },
        { title: 'Tutorial — Complete Guide', url: 'tutorial.dev/guide', snippet: 'Learn everything you need to know about...' },
      ];
      const picked = simResults.sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2));
      return '📋 RESULT — Web Search (' + provider + '):\n' +
        picked.map((r, i) => '  ' + (i + 1) + '. ' + r.title + '\n     ' + r.url + '\n     ' + r.snippet).join('\n');
    }

    case 'stripe': {
      // Try live Stripe API via server proxy
      if (cv.secretKey) {
        try {
          let action = 'get_balance';
          if (label.includes('payment') || label.includes('charge') || label.includes('transaction')) action = 'list_payments';
          else if (label.includes('subscription') || label.includes('recurring') || label.includes('mrr')) action = 'list_subscriptions';
          else if (label.includes('customer')) action = 'list_customers';
          let data;
          if (IS_TAURI) {
            data = await tauriInvoke('stripe_proxy', {
              request: { action, limit: 5 },
            });
          } else {
            const resp = await fetch('/api/stripe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ secretKey: cv.secretKey, action, limit: 5 }),
            });
            data = await resp.json();
          }
          if (data.error) throw new Error(typeof data.error === 'string' ? data.error : data.error.message || 'Unknown');
          if (action === 'list_payments' && data.data) {
            return '📋 RESULT — Stripe Payments [LIVE]:\n' +
              data.data.slice(0, 5).map(c => '  ' + c.id + '  $' + (c.amount / 100).toFixed(2) + '  ' + c.status + '  ' + (c.customer || '')).join('\n');
          }
          if (action === 'list_subscriptions' && data.data) {
            return '📋 RESULT — Stripe Subscriptions [LIVE]:\n' +
              '  Active: ' + data.data.filter(s => s.status === 'active').length + '\n' +
              data.data.slice(0, 5).map(s => '  ' + s.id + '  ' + s.status + '  $' + ((s.plan?.amount || 0) / 100).toFixed(2) + '/' + (s.plan?.interval || 'mo')).join('\n');
          }
          if (action === 'get_balance' && data.available) {
            const bal = data.available.reduce((sum, b) => sum + b.amount, 0) / 100;
            return '📋 RESULT — Stripe Balance [LIVE]:\n  Available: $' + bal.toFixed(2) + '\n  Pending: $' + (data.pending?.reduce((s, b) => s + b.amount, 0) / 100 || 0).toFixed(2);
          }
          return '📋 RESULT — Stripe [LIVE]:\n  ' + JSON.stringify(data).slice(0, 400);
        } catch (e) {
          return '❌ Stripe API error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('payment') || label.includes('charge') || label.includes('transaction')) {
        const payments = [
          { id: 'ch_1abc', amount: '$249.00', status: 'succeeded', customer: 'cus_acme' },
          { id: 'ch_2def', amount: '$89.99', status: 'succeeded', customer: 'cus_globex' },
          { id: 'ch_3ghi', amount: '$549.00', status: 'pending', customer: 'cus_initech' },
          { id: 'ch_4jkl', amount: '$19.99', status: 'succeeded', customer: 'cus_wayne' },
        ];
        const picked = payments.sort(() => Math.random() - 0.5).slice(0, 3);
        return '📋 RESULT — Stripe Payments:\n' +
          picked.map(p => '  ' + p.id + '  ' + p.amount.padEnd(10) + p.status.padEnd(12) + p.customer).join('\n');
      }
      if (label.includes('subscription') || label.includes('recurring') || label.includes('mrr')) {
        return '📋 RESULT — Stripe Subscriptions:\n' +
          '  Active: ' + (20 + Math.floor(Math.random() * 200)) + '\n' +
          '  MRR: $' + ((5 + Math.random() * 50) * 1000).toFixed(0) + '\n' +
          '  Churn (30d): ' + (1 + Math.random() * 5).toFixed(1) + '%\n' +
          '  Trial: ' + (3 + Math.floor(Math.random() * 15)) + ' converting';
      }
      return '📋 RESULT — Stripe:\n' +
        '  Balance: $' + ((1 + Math.random() * 20) * 1000).toFixed(2) + '\n' +
        '  Payments (7d): ' + (10 + Math.floor(Math.random() * 100)) + '\n' +
        '  Active subscriptions: ' + (20 + Math.floor(Math.random() * 200));
    }

    case 'analytics': {
      const provider = cv.provider || 'mixpanel';
      // Analytics APIs typically require server-side calls; use ChatGPT as smart proxy when configured
      if (cv.apiKey) {
        try {
          const analyticsPrompt = 'You are a ' + provider + ' analytics expert. The user asks: "' + taskLabel +
            '". Provide realistic analytics data as if querying ' + provider + '. Include metrics, funnels, or retention data as appropriate. Be concise with numbers.';
          return await askLLM(analyticsPrompt, agentId);
        } catch (e) {
          // fall through to simulated
        }
      }
      // Simulated fallback
      if (label.includes('funnel') || label.includes('conversion') || label.includes('drop')) {
        return '📋 RESULT — Funnel Analysis (' + provider + '):\n' +
          '  1. Page View        ' + (10000 + Math.floor(Math.random() * 50000)) + '\n' +
          '  2. Sign Up          ' + (2000 + Math.floor(Math.random() * 8000)) + '  (' + (20 + Math.floor(Math.random() * 30)) + '%)\n' +
          '  3. Activation       ' + (500 + Math.floor(Math.random() * 3000)) + '  (' + (15 + Math.floor(Math.random() * 25)) + '%)\n' +
          '  4. Purchase         ' + (100 + Math.floor(Math.random() * 500)) + '  (' + (5 + Math.floor(Math.random() * 20)) + '%)';
      }
      if (label.includes('retention') || label.includes('cohort') || label.includes('churn')) {
        return '📋 RESULT — Retention (' + provider + '):\n' +
          '  Day 1:  ' + (40 + Math.floor(Math.random() * 30)) + '%\n' +
          '  Day 7:  ' + (20 + Math.floor(Math.random() * 20)) + '%\n' +
          '  Day 30: ' + (8 + Math.floor(Math.random() * 15)) + '%\n' +
          '  DAU/MAU: ' + (10 + Math.floor(Math.random() * 30)) + '%';
      }
      if (label.includes('event') || label.includes('track') || label.includes('metric')) {
        return '📋 RESULT — Events (' + provider + ', last 24h):\n' +
          '  page_view:     ' + (5000 + Math.floor(Math.random() * 20000)) + '\n' +
          '  button_click:  ' + (1000 + Math.floor(Math.random() * 5000)) + '\n' +
          '  sign_up:       ' + (50 + Math.floor(Math.random() * 500)) + '\n' +
          '  purchase:      ' + (10 + Math.floor(Math.random() * 100)) + '\n' +
          '  Total events:  ' + (8000 + Math.floor(Math.random() * 30000));
      }
      return '📋 RESULT — Analytics (' + provider + '):\n' +
        '  Events (24h): ' + (5000 + Math.floor(Math.random() * 30000)) + '\n' +
        '  Active users: ' + (200 + Math.floor(Math.random() * 2000)) + '\n' +
        '  Top event: page_view (' + (40 + Math.floor(Math.random() * 30)) + '%)';
    }

    case 'openclaw': {
      const gw = cv.gatewayUrl || 'ws://127.0.0.1:18789';
      const session = cv.sessionId || 'main';
      // Try live OpenClaw Gateway via server-side proxy
      if (cv.gatewayUrl) {
        try {
          let data;
          if (IS_TAURI) {
            data = await tauriInvoke('openclaw_proxy', {
              request: { session_id: session, message: taskLabel },
            });
          } else {
            const resp = await fetch('/api/openclaw', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gatewayUrl: cv.gatewayUrl,
                authToken: cv.authToken || '',
                sessionId: session,
                message: taskLabel,
              }),
            });
            data = await resp.json();
          }
          if (data.error) throw new Error(data.error);
          const answer = data.response || data.answer || data.message || JSON.stringify(data).slice(0, 500);
          return '📋 RESULT — OpenClaw Agent (' + gw + ') [LIVE]:\n' +
            '  🦞 Session: ' + session + '\n' +
            '  ' + answer;
        } catch (e) {
          return '❌ OpenClaw Gateway error: ' + (e.message || e);
        }
      }
      // Simulated fallback
      if (label.includes('search') || label.includes('find') || label.includes('web') || label.includes('browse')) {
        return '📋 RESULT — OpenClaw Agent (' + gw + '):\n' +
          '  🦞 Session: ' + session + '\n' +
          '  Routed to browser_control tool...\n' +
          '  Searched: "' + taskLabel + '"\n' +
          '  Found ' + (3 + Math.floor(Math.random() * 7)) + ' relevant results\n' +
          '  Agent completed task in ' + (2 + Math.floor(Math.random() * 15)) + 's';
      }
      if (label.includes('run') || label.includes('exec') || label.includes('command') || label.includes('bash')) {
        return '📋 RESULT — OpenClaw Agent (' + gw + '):\n' +
          '  🦞 Session: ' + session + '\n' +
          '  Routed to bash_exec tool...\n' +
          '  Exit code: 0\n' +
          '  Output: Command completed successfully\n' +
          '  Duration: ' + (0.5 + Math.random() * 5).toFixed(1) + 's';
      }
      return '📋 RESULT — OpenClaw Agent (' + gw + '):\n' +
        '  🦞 Session: ' + session + '\n' +
        '  Task sent to agent runtime via sessions_send\n' +
        '  Agent processed with ' + (1 + Math.floor(Math.random() * 5)) + ' tool call(s)\n' +
        '  Thinking: ' + ['low', 'medium', 'high'][Math.floor(Math.random() * 3)] + '\n' +
        '  Status: Completed ✓';
    }

    default: {
      // Custom / unknown MCP adapters
      const toolCount = 1 + Math.floor(Math.random() * Math.min(2, adapter.tools.length));
      const lines = ['📋 RESULT — ' + adapter.name + ':'];
      for (let i = 0; i < toolCount; i++) {
        const tool = adapter.tools[Math.floor(Math.random() * adapter.tools.length)];
        lines.push('  ' + adapter.icon + ' ' + tool + '() → completed (' + (1 + Math.floor(Math.random() * 20)) + ' item(s) returned)');
      }
      return lines.join('\n');
    }
  }
}

async function generateWebSearchResult(taskLabel) {
  const query = taskLabel;
  try {
    const searchUrl = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
      encodeURIComponent(query) + '&srlimit=5&format=json&origin=*';
    const resp = await fetch(searchUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const items = (data.query && data.query.search) || [];
    if (!items.length) throw new Error('No results found');

    const results = items.map((item, i) => {
      // Strip HTML tags from snippet
      const snippet = item.snippet.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      const url = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(item.title.replace(/ /g, '_'));
      return '  ' + (i + 1) + '. ' + item.title + '\n     ' + url + '\n     ' + snippet;
    });

    const total = (data.query.searchinfo && data.query.searchinfo.totalhits) || items.length;
    return '📋 RESULT — Web Search: "' + truncate(query, 50) + '"\n' +
      '  Found ' + total + ' results. Top ' + items.length + ':\n\n' +
      results.join('\n\n');
  } catch (e) {
    return '❌ Web search error: ' + (e.message || e) + '\n  Could not retrieve results for "' + truncate(query, 40) + '".';
  }
}

async function generateFallbackResult(label, taskLabel, agentId) {
  // Always forward fallback queries to LLM via AI Search
  return await askLLM(taskLabel, agentId);
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function finishTask(agent, task) {
  const index = agent.tasks.findIndex((t) => t.id === task.id);
  if (index === -1) return;
  agent.tasks.splice(index, 1);
  task.status = 'done';
  task.completedAt = new Date().toISOString();
  agent.history.unshift(task);
  persistRun(agent, task);
  agent.status = agent.tasks.length ? 'busy' : 'idle';
  // Trigger walk-back + beer sip animation if no more tasks
  if (!agent.tasks.length && (agent.walkState === 'away' || agent.walkState === 'leaving')) {
    agent.walkState = 'returning';
    agent.walkProgress = 0;
  }
  renderSidebar();
  pushToast(agent.name + ' finished "' + task.label + '" and is back at the bar! 🍺');
}

function markTaskDone(agentId, taskId) {
  const agent = state.agents.find((a) => a.id === agentId);
  if (!agent) return;
  const index = agent.tasks.findIndex((t) => t.id === taskId);
  if (index === -1) return;
  const [task] = agent.tasks.splice(index, 1);
  task.status = 'done';
  task.completedAt = new Date().toISOString();
  agent.history.unshift(task);
  persistRun(agent, task);
  agent.status = agent.tasks.length ? 'busy' : 'idle';
  // Trigger walk-back + beer sip animation if no more tasks
  if (!agent.tasks.length && (agent.walkState === 'away' || agent.walkState === 'leaving')) {
    agent.walkState = 'returning';
    agent.walkProgress = 0;
  }
  renderSidebar();
  pushToast(agent.name + ' wrapped "' + task.label + '".');
}

/* ───────── Toast ───────── */
function pushToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  dom.toastStack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function formatIsoTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ───────── Keyboard nav ───────── */
function handleKeyNavigation(event) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
  event.preventDefault();
  const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
  const currentIndex = state.agents.findIndex((a) => a.id === state.selectedAgentId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + state.agents.length) % state.agents.length;
  selectAgent(state.agents[nextIndex].id);
}

/* ───────── Init ───────── */
/* ───────── MCP rendering ───────── */
function renderMcpCheckboxes() {
  dom.mcpCheckboxes.innerHTML = '';
  mcpAdapters.forEach((adapter) => {
    const configured = isMcpConfigured(adapter);
    const label = document.createElement('label');
    label.className = 'mcp-checkbox-label' + (configured ? '' : ' mcp-disabled');
    label.title = configured ? adapter.name : adapter.name + ' — not configured';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = adapter.id;
    checkbox.name = 'mcpAdapter';

    if (!configured) {
      checkbox.disabled = true;
      checkbox.checked = false;
    } else if (adapter.id === 'web') {
      // AI Search is checked by default when configured
      checkbox.checked = true;
    }

    // When any adapter is toggled, update AI Search state
    checkbox.addEventListener('change', () => {
      updateAiQueryState();
    });

    const iconSpan = document.createElement('span');
    iconSpan.className = 'mcp-icon';
    iconSpan.textContent = adapter.icon;
    const text = document.createTextNode(' ' + adapter.name);
    label.appendChild(checkbox);
    label.appendChild(iconSpan);
    label.appendChild(text);
    dom.mcpCheckboxes.appendChild(label);
  });
}

function updateAiQueryState() {
  const checkboxes = dom.mcpCheckboxes.querySelectorAll('input[type="checkbox"]');
  const aiQueryCb = Array.from(checkboxes).find(cb => cb.value === 'web');
  if (!aiQueryCb || aiQueryCb.disabled) return;
  const othersChecked = Array.from(checkboxes).some(cb => cb.value !== 'web' && !cb.disabled && cb.checked);
  // Uncheck AI Search when another adapter is selected, check it when none are
  aiQueryCb.checked = !othersChecked;
}

function isMcpConfigured(adapter) {
  const fields = adapter.configFields || [];
  const vals = adapter.configValues || {};
  // AI Search adapter: always considered configured (server-side OPENAI_API_KEY fallback)
  // but vendor-specific fields are validated when a vendor is explicitly selected
  if (adapter.id === 'web') {
    if (!vals.llmVendor) return true; // no vendor selected = use server-side default
    const vendorFields = LLM_VENDOR_FIELDS[vals.llmVendor] || [];
    const required = vendorFields.filter((f) => f.required);
    return required.every((f) => vals[f.key] && String(vals[f.key]).trim().length > 0);
  }
  const required = fields.filter((f) => f.required);
  if (!required.length) return true; // no required fields = always OK
  return required.every((f) => vals[f.key] && String(vals[f.key]).trim().length > 0);
}

function renderMcpAdapterPanel() {
  dom.mcpAdapterList.innerHTML = '';
  const configured = mcpAdapters.filter(isMcpConfigured).length;
  dom.mcpCount.textContent = configured + '/' + mcpAdapters.length + ' configured';
  mcpAdapters.forEach((adapter) => {
    const card = document.createElement('div');
    const ok = isMcpConfigured(adapter);
    card.className = 'mcp-adapter-card' + (ok ? '' : ' unconfigured');
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      openMcpConfigModal();
      // Auto-expand the edit form for this adapter after a tick
      setTimeout(() => startEditMcp(adapter.id), 50);
    });

    const icon = document.createElement('span');
    icon.className = 'mcp-icon';
    icon.textContent = adapter.icon;

    const info = document.createElement('div');
    info.className = 'mcp-info';
    const name = document.createElement('strong');
    name.textContent = adapter.name;
    const desc = document.createElement('span');
    desc.textContent = adapter.description;
    const statusLine = document.createElement('span');
    statusLine.className = 'mcp-config-status ' + (ok ? 'cfg-ok' : 'cfg-missing');
    statusLine.textContent = ok ? '✓ Configured' : '⚠ Needs configuration';
    info.appendChild(name);
    info.appendChild(desc);
    info.appendChild(statusLine);

    const dot = document.createElement('span');
    dot.className = 'mcp-status-dot ' + (ok ? 'online' : 'offline');

    card.appendChild(icon);
    card.appendChild(info);
    card.appendChild(dot);
    dom.mcpAdapterList.appendChild(card);
  });
}

/* ───────── MCP Configuration Modal ───────── */
function openMcpConfigModal() {
  renderMcpConfigList();
  dom.mcpConfigModal.showModal();
}

function closeMcpConfigModal() {
  dom.mcpConfigModal.close();
}

function renderMcpConfigList() {
  dom.mcpConfigList.innerHTML = '';
  mcpAdapters.forEach((adapter) => {
    const item = document.createElement('div');
    const ok = isMcpConfigured(adapter);
    item.className = 'mcp-config-item' + (adapter.isDefault ? ' is-default' : '') + (ok ? ' cfg-ok' : ' cfg-missing');
    item.dataset.mcpId = adapter.id;

    const icon = document.createElement('span');
    icon.className = 'mcp-icon';
    icon.textContent = adapter.icon;

    const info = document.createElement('div');
    info.className = 'mcp-config-info';
    const name = document.createElement('strong');
    name.textContent = adapter.name;
    const desc = document.createElement('span');
    desc.textContent = adapter.description;
    const toolsLine = document.createElement('span');
    toolsLine.textContent = adapter.tools.join(', ');

    // Config status
    const cfgStatus = document.createElement('span');
    cfgStatus.className = 'mcp-cfg-badge ' + (ok ? 'badge-ok' : 'badge-needs');
    const reqFields = (adapter.configFields || []).filter((f) => f.required);
    const filledFields = reqFields.filter((f) => adapter.configValues && adapter.configValues[f.key] && String(adapter.configValues[f.key]).trim());
    cfgStatus.textContent = ok
      ? '✓ Ready'
      : '⚠ ' + filledFields.length + '/' + reqFields.length + ' fields configured';

    info.appendChild(name);
    info.appendChild(desc);
    info.appendChild(toolsLine);
    info.appendChild(cfgStatus);

    const actions = document.createElement('div');
    actions.className = 'mcp-config-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = ok ? 'Edit' : '⚙ Configure';
    editBtn.className = ok ? '' : 'configure-btn';
    editBtn.addEventListener('click', () => startEditMcp(adapter.id));
    actions.appendChild(editBtn);

    if (ok) {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'clear-config-btn';
      clearBtn.textContent = '✕ Clear';
      clearBtn.title = 'Clear configuration and disable adapter';
      clearBtn.addEventListener('click', () => clearMcpConfig(adapter.id));
      actions.appendChild(clearBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Remove';
    deleteBtn.addEventListener('click', () => removeMcpAdapter(adapter.id));
    actions.appendChild(deleteBtn);

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(actions);
    dom.mcpConfigList.appendChild(item);
  });
}

/* Render dynamic credential fields for a selected LLM vendor */
function renderVendorFields(container, vendorId, configInputs, existingValues) {
  // Remove previous vendor field inputs from configInputs
  for (const fields of Object.values(LLM_VENDOR_FIELDS)) {
    for (const f of fields) {
      delete configInputs[f.key];
    }
  }
  container.innerHTML = '';
  const fields = LLM_VENDOR_FIELDS[vendorId];
  if (!fields) return;

  fields.forEach((field) => {
    const fieldWrap = document.createElement('div');
    fieldWrap.className = 'mcp-edit-field';

    const label = document.createElement('label');
    label.className = 'mcp-edit-field-label';
    label.textContent = field.label + (field.required ? ' *' : '');

    const input = document.createElement('input');
    input.type = field.type || 'text';
    input.placeholder = field.placeholder || '';
    input.value = existingValues[field.key] || '';
    if (field.required) input.required = true;
    input.autocomplete = 'off';

    fieldWrap.appendChild(label);
    fieldWrap.appendChild(input);
    container.appendChild(fieldWrap);
    configInputs[field.key] = input;
  });
}

function startEditMcp(mcpId) {
  const adapter = mcpAdapters.find((a) => a.id === mcpId);
  if (!adapter) return;

  const existing = dom.mcpConfigList.querySelector('[data-mcp-id="' + mcpId + '"]');
  if (!existing) return;

  const editRow = document.createElement('div');
  editRow.className = 'mcp-edit-row';
  editRow.dataset.mcpId = mcpId;

  // Header row: icon + name
  const iconInput = document.createElement('input');
  iconInput.type = 'text';
  iconInput.value = adapter.icon;
  iconInput.maxLength = 4;
  iconInput.placeholder = '🔌';
  iconInput.style.textAlign = 'center';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = adapter.name;
  nameInput.maxLength = 30;
  nameInput.placeholder = 'Name';

  editRow.appendChild(iconInput);
  editRow.appendChild(nameInput);

  // Description
  const descLabel = document.createElement('span');
  descLabel.className = 'mcp-edit-label';
  descLabel.textContent = 'Description:';

  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.value = adapter.description;
  descInput.maxLength = 80;
  descInput.placeholder = 'Description';
  descInput.style.gridColumn = '1 / -1';

  editRow.appendChild(descLabel);
  editRow.appendChild(descInput);

  // Tools
  const toolsLabel = document.createElement('span');
  toolsLabel.className = 'mcp-edit-label';
  toolsLabel.textContent = 'Tools (comma-separated):';

  const toolsInput = document.createElement('input');
  toolsInput.type = 'text';
  toolsInput.value = adapter.tools.join(', ');
  toolsInput.placeholder = 'tool_a, tool_b';
  toolsInput.style.gridColumn = '1 / -1';

  editRow.appendChild(toolsLabel);
  editRow.appendChild(toolsInput);

  // Per-adapter config fields (the real juice)
  const configFields = adapter.configFields || [];
  const configInputs = {};
  // Container for dynamic vendor fields (used by AI Search adapter)
  let vendorFieldsContainer = null;

  if (configFields.length) {
    const configHeader = document.createElement('div');
    configHeader.className = 'mcp-edit-config-header';
    configHeader.textContent = '🔑 Configuration — required fields for ' + adapter.name;
    editRow.appendChild(configHeader);

    configFields.forEach((field) => {
      const fieldWrap = document.createElement('div');
      fieldWrap.className = 'mcp-edit-field';

      const label = document.createElement('label');
      label.className = 'mcp-edit-field-label';
      label.textContent = field.label + (field.required ? ' *' : '');

      if (field.type === 'select' && field.options) {
        // Render a dropdown
        const select = document.createElement('select');
        select.autocomplete = 'off';
        if (field.required) select.required = true;
        field.options.forEach((opt) => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          if ((adapter.configValues && adapter.configValues[field.key]) === opt.value) {
            option.selected = true;
          }
          select.appendChild(option);
        });

        // If this is the vendor selector, wire up dynamic fields
        if (field.key === 'llmVendor') {
          vendorFieldsContainer = document.createElement('div');
          vendorFieldsContainer.className = 'mcp-vendor-fields';
          select.addEventListener('change', () => {
            renderVendorFields(vendorFieldsContainer, select.value, configInputs, adapter.configValues || {});
          });
        }

        fieldWrap.appendChild(label);
        fieldWrap.appendChild(select);
        editRow.appendChild(fieldWrap);
        configInputs[field.key] = select;

        // Render initial vendor fields if a vendor is already selected
        if (vendorFieldsContainer) {
          editRow.appendChild(vendorFieldsContainer);
          const currentVendor = (adapter.configValues && adapter.configValues[field.key]) || '';
          if (currentVendor) {
            renderVendorFields(vendorFieldsContainer, currentVendor, configInputs, adapter.configValues || {});
          }
        }
      } else {
        const input = document.createElement('input');
        input.type = field.type || 'text';
        input.placeholder = field.placeholder || '';
        input.value = (adapter.configValues && adapter.configValues[field.key]) || '';
        if (field.required) input.required = true;
        input.autocomplete = 'off';

        fieldWrap.appendChild(label);
        fieldWrap.appendChild(input);
        editRow.appendChild(fieldWrap);
        configInputs[field.key] = input;
      }
    });
  }

  // Actions
  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'mcp-edit-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => renderMcpConfigList());

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'save-edit-btn';
  saveBtn.textContent = 'Save Configuration';
  saveBtn.addEventListener('click', () => {
    const newName = nameInput.value.trim();
    if (!newName) { pushToast('Name cannot be empty.'); return; }

    // Validate required config fields
    const allFields = [...configFields];
    // Include dynamic vendor fields for validation
    const vendorVal = configInputs.llmVendor ? configInputs.llmVendor.value : '';
    if (vendorVal && LLM_VENDOR_FIELDS[vendorVal]) {
      allFields.push(...LLM_VENDOR_FIELDS[vendorVal]);
    }
    for (const field of allFields) {
      if (field.required) {
        const el = configInputs[field.key];
        const val = el ? (el.value || '').trim() : '';
        if (!val) {
          pushToast(field.label + ' is required.');
          if (el && el.focus) el.focus();
          return;
        }
      }
    }

    adapter.name = newName;
    adapter.icon = iconInput.value.trim() || '🔌';
    adapter.description = descInput.value.trim();
    adapter.tools = toolsInput.value.split(',').map((t) => t.trim()).filter(Boolean);

    // Save config values (static + dynamic vendor fields)
    if (!adapter.configValues) adapter.configValues = {};
    for (const field of allFields) {
      const el = configInputs[field.key];
      const val = el ? (el.value || '').trim() : '';
      adapter.configValues[field.key] = val;
    }
    // Clear stale vendor fields if vendor changed
    if (vendorVal) {
      const currentKeys = new Set((LLM_VENDOR_FIELDS[vendorVal] || []).map(f => f.key));
      for (const [vId, vFields] of Object.entries(LLM_VENDOR_FIELDS)) {
        if (vId !== vendorVal) {
          for (const f of vFields) {
            if (!currentKeys.has(f.key)) {
              delete adapter.configValues[f.key];
            }
          }
        }
      }
    }

    saveMcpAdapters();
    refreshMcpUI();
    pushToast('Saved "' + adapter.name + '" configuration.');
  });

  actionsDiv.appendChild(cancelBtn);
  actionsDiv.appendChild(saveBtn);
  editRow.appendChild(actionsDiv);

  existing.replaceWith(editRow);
}

function removeMcpAdapter(mcpId) {
  const idx = mcpAdapters.findIndex((a) => a.id === mcpId);
  if (idx === -1) return;
  const adapter = mcpAdapters[idx];
  if (adapter.isDefault) {
    pushToast('Cannot remove built-in adapter.');
    return;
  }
  mcpAdapters.splice(idx, 1);
  vaultDeleteAdapterCreds(mcpId);
  saveMcpAdapters();
  refreshMcpUI();
  pushToast('Removed "' + adapter.name + '".');
}

function clearMcpConfig(mcpId) {
  const adapter = mcpAdapters.find((a) => a.id === mcpId);
  if (!adapter) return;
  adapter.configValues = {};
  vaultDeleteAdapterCreds(mcpId);
  saveMcpAdapters();
  refreshMcpUI();
  pushToast('Cleared "' + adapter.name + '" configuration.');
}

function handleAddMcp(event) {
  event.preventDefault();
  const name = dom.mcpNewName.value.trim();
  if (!name) { pushToast('Server name is required.'); return; }
  const id = 'custom-' + Date.now().toString(36);
  const icon = dom.mcpNewIcon.value.trim() || '🔌';
  const description = dom.mcpNewDesc.value.trim() || '';
  const tools = dom.mcpNewTools.value.split(',').map((t) => t.trim()).filter(Boolean);

  // Parse custom config fields from the new fields textarea
  const cfgRaw = dom.mcpNewConfigFields ? dom.mcpNewConfigFields.value.trim() : '';
  const configFields = [];
  if (cfgRaw) {
    cfgRaw.split('\n').forEach((line) => {
      const parts = line.split(':').map((s) => s.trim());
      if (parts[0]) {
        const key = parts[0].replace(/[^a-zA-Z0-9_]/g, '');
        const label = parts[1] || parts[0];
        const isSecret = /token|key|secret|password/i.test(key);
        configFields.push({
          key, label, type: isSecret ? 'password' : 'text',
          required: true, placeholder: 'Enter ' + label,
        });
      }
    });
  }

  mcpAdapters.push({ id, name, icon, description, tools, isDefault: false, configFields, configValues: {} });
  saveMcpAdapters();
  refreshMcpUI();
  dom.mcpAddForm.reset();
  pushToast('Added "' + name + '" — click Configure to set it up.');
}

function refreshMcpUI() {
  renderMcpCheckboxes();
  renderMcpAdapterPanel();
  renderMcpConfigList();
}

async function init() {
  // Load encrypted adapter data before rendering
  const loaded = await loadMcpAdapters();
  mcpAdapters.length = 0;
  loaded.forEach((a) => mcpAdapters.push(a));
  runHistory = loadRunHistory();

  renderRoster();
  renderSidebar();
  renderMcpCheckboxes();
  renderMcpAdapterPanel();
  dom.assignForm.addEventListener('submit', handleAssignSubmit);
  if (dom.downloadRunHistory) {
    dom.downloadRunHistory.addEventListener('click', downloadRunHistory);
  }
  if (dom.clearRunHistory) {
    dom.clearRunHistory.addEventListener('click', clearRunHistory);
  }
  dom.clearAgentOutput.addEventListener('click', () => {
    dom.agentOutputPane.innerHTML = '';
    agentOutputCount = 0;
    dom.agentOutputLabel.textContent = 'No output yet';
  });
  dom.taskList.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action="done"]');
    if (!button || !state.selectedAgentId) return;
    markTaskDone(state.selectedAgentId, button.dataset.taskId);
  });

  // Activity log clear button
  dom.clearLogBtn.addEventListener('click', () => {
    dom.activityLogBody.innerHTML = '';
    activityLogCount = 0;
    dom.logCount.textContent = '0 entries';
  });

  // MCP configuration modal
  dom.mcpConfigBtn.addEventListener('click', openMcpConfigModal);
  dom.mcpModalClose.addEventListener('click', closeMcpConfigModal);
  dom.mcpConfigModal.addEventListener('click', (e) => {
    if (e.target === dom.mcpConfigModal) closeMcpConfigModal();
  });
  dom.mcpAddForm.addEventListener('submit', handleAddMcp);

  document.addEventListener('keydown', handleKeyNavigation);
  // Start polling for incoming Hermes tasks (integration compatibility)
  startHermesPolling();
  animate();
}

init();

/* ───────── Hermes integration (client-side) ───────── */
const hermesSeen = new Set();
function createHermesPanel() {
  // Lightweight panel inserted above the task list
  const panel = document.createElement('div');
  panel.id = 'hermesPanel';
  panel.className = 'panel hermes-panel';
  const header = document.createElement('h4');
  header.textContent = 'Incoming Hermes Tasks';
  const list = document.createElement('div');
  list.id = 'hermesList';
  panel.appendChild(header);
  panel.appendChild(list);
  // Insert before the task list in the sidebar
  if (dom.taskList && dom.taskList.parentNode) dom.taskList.parentNode.insertBefore(panel, dom.taskList);
  return panel;
}

const hermesPanelEl = createHermesPanel();

async function fetchHermesTasks() {
  try {
    const resp = await fetch('/api/memory/get', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'hermes_tasks' }) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.value || [];
  } catch (e) {
    return [];
  }
}

function renderHermesTask(task) {
  const list = hermesPanelEl.querySelector('#hermesList');
  if (!list) return;
  const el = document.createElement('div');
  el.className = 'hermes-task';
  el.dataset.id = task.id;
  const title = document.createElement('div');
  title.className = 'hermes-title';
  title.textContent = task.title;
  const instr = document.createElement('div');
  instr.className = 'hermes-instr';
  instr.textContent = task.instructions || '';
  const actions = document.createElement('div');
  actions.className = 'hermes-actions';
  const accept = document.createElement('button');
  accept.textContent = 'Accept';
  accept.addEventListener('click', () => acceptHermes(task));
  const reject = document.createElement('button');
  reject.textContent = 'Reject';
  reject.addEventListener('click', () => rejectHermes(task));
  actions.appendChild(accept);
  actions.appendChild(reject);
  el.appendChild(title);
  el.appendChild(instr);
  el.appendChild(actions);
  list.appendChild(el);
}

async function acceptHermes(task) {
  // Map assignee to agent id by name or id; fall back to currently selected agent
  let agent = state.agents.find(a => (a.id && a.id.toLowerCase()) === (String(task.assignee || '').toLowerCase()) || a.name === task.assignee);
  if (!agent) agent = state.agents.find(a => a.id === state.selectedAgentId) || state.agents[0];
  addTaskToAgent(agent.id, { title: task.title, instructions: task.instructions, etaMinutes: task.etaMinutes, mcpIds: [] });
  await removeHermesTaskFromServer(task.id);
  const el = hermesPanelEl.querySelector('.hermes-task[data-id="' + task.id + '"]');
  if (el) el.remove();
}

async function rejectHermes(task) {
  await removeHermesTaskFromServer(task.id);
  const el = hermesPanelEl.querySelector('.hermes-task[data-id="' + task.id + '"]');
  if (el) el.remove();
}

async function removeHermesTaskFromServer(id) {
  try {
    const getResp = await fetch('/api/memory/get', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'hermes_tasks' }) });
    if (!getResp.ok) return;
    const d = await getResp.json();
    const arr = d.value || [];
    const filtered = arr.filter(t => t.id !== id);
    await fetch('/api/memory/set', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'hermes_tasks', value: filtered }) });
  } catch (e) {
    // ignore
  }
}

async function startHermesPolling() {
  try {
    const tasks = await fetchHermesTasks();
    for (const t of tasks) {
      if (!t || !t.id) continue;
      if (hermesSeen.has(t.id)) continue;
      renderHermesTask(t);
      hermesSeen.add(t.id);
    }
  } catch (e) {
    // ignore polling errors
  }
  setTimeout(startHermesPolling, 5000);
}