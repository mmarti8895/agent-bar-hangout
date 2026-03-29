/**
 * Lightweight dev server for Agent Bar Hangout.
 * - Serves static files from the project root
 * - Proxies /api/chat to multiple LLM vendors (OpenAI, Anthropic, Google, xAI, DeepSeek, Ollama, Mistral, Cohere, Perplexity)
 * - Proxies /api/slack, /api/stripe, /api/email, /api/calendar,
 *   /api/monitoring, /api/analytics, /api/openclaw for live adapters
 * 
 * Usage:  node server.js
 * Then open http://localhost:8080
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = process.env.PORT || 8080;

/* ───── Load .env ───── */
let OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
try {
  const envText = await readFile(join(__dirname, '.env'), 'utf-8');
  for (const line of envText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key === 'OPENAI_API_KEY' && val) OPENAI_API_KEY = val;
  }
} catch { /* no .env file */ }

if (!OPENAI_API_KEY) {
  console.error('\u26a0  OPENAI_API_KEY not set. Add it to .env or set as environment variable. You can also configure a different LLM vendor in the UI.');
}

/* ───── MIME types ───── */
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/* ───── Per-agent context engine (rolling 3-min TTL) ───── */
const CTX_TTL_MS = 3 * 60 * 1000;   // 3 minutes per entry
const CTX_MAX_PAIRS = 5;            // max user+assistant pairs per agent (10 messages)
const agentContexts = new Map();     // agentId → [{ role, content, expiresAt }]

function pruneExpired(entries) {
  const now = Date.now();
  return entries.filter(e => e.expiresAt > now);
}

function getAgentContext(agentId) {
  if (!agentId) return [];
  const raw = agentContexts.get(agentId) || [];
  const valid = pruneExpired(raw);
  if (valid.length !== raw.length) agentContexts.set(agentId, valid);
  return valid;
}

function pushAgentContext(agentId, role, content) {
  if (!agentId) return;
  const entries = getAgentContext(agentId);         // auto-prunes
  entries.push({ role, content, expiresAt: Date.now() + CTX_TTL_MS });
  // Cap: keep the last CTX_MAX_PAIRS pairs (each pair = user + assistant)
  while (entries.length > CTX_MAX_PAIRS * 2) entries.shift();
  agentContexts.set(agentId, entries);
}

function clearAgentContextServer(agentId) {
  agentContexts.delete(agentId);
}

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB limit for POST bodies

/* ───── LLM proxy (multi-vendor) ───── */
async function handleChatProxy(req, res) {
  let body = '';
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request body too large' }));
      return;
    }
    body += chunk;
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { prompt, agentId, vendor, vendorConfig } = parsed;
  if (!prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing "prompt" field' }));
    return;
  }

  // Build the system prompt and conversation history
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const systemPrompt = 'You are a helpful assistant. Today is ' + today + '. Provide concise, factual answers. For weather, include current conditions, temperature, humidity, wind, and forecast when possible. For searches, provide relevant factual information with sources when applicable. If the user refers to something from a previous answer, use the conversation history to respond accurately.';

  const ctx = getAgentContext(agentId);

  // Determine which vendor to use
  const effectiveVendor = vendor || 'openai';
  const vc = vendorConfig || {};

  try {
    let answer;
    switch (effectiveVendor) {
      case 'openai':
        answer = await callOpenAI(systemPrompt, ctx, prompt, vc);
        break;
      case 'anthropic':
        answer = await callAnthropic(systemPrompt, ctx, prompt, vc);
        break;
      case 'google':
        answer = await callGemini(systemPrompt, ctx, prompt, vc);
        break;
      case 'xai':
        answer = await callXAI(systemPrompt, ctx, prompt, vc);
        break;
      case 'deepseek':
        answer = await callDeepSeek(systemPrompt, ctx, prompt, vc);
        break;
      case 'ollama':
        answer = await callOllama(systemPrompt, ctx, prompt, vc);
        break;
      case 'mistral':
        answer = await callMistral(systemPrompt, ctx, prompt, vc);
        break;
      case 'cohere':
        answer = await callCohere(systemPrompt, ctx, prompt, vc);
        break;
      case 'perplexity':
        answer = await callPerplexity(systemPrompt, ctx, prompt, vc);
        break;
      default:
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unknown LLM vendor: ' + effectiveVendor }));
        return;
    }

    // Store conversation context
    pushAgentContext(agentId, 'user', prompt);
    pushAgentContext(agentId, 'assistant', answer);

    const ctxCount = getAgentContext(agentId).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ answer, vendor: effectiveVendor, contextEntries: ctxCount }));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'LLM request failed: ' + e.message }));
  }
}

/* ─── Build OpenAI-style messages array ─── */
function buildMessages(systemPrompt, ctx, prompt) {
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const entry of ctx) {
    messages.push({ role: entry.role, content: entry.content });
  }
  messages.push({ role: 'user', content: prompt });
  return messages;
}

/* ─── OpenAI / ChatGPT ─── */
async function callOpenAI(systemPrompt, ctx, prompt, vc) {
  const apiKey = vc.apiKey || OPENAI_API_KEY;
  if (!apiKey) throw new Error('OpenAI API key not configured');
  const messages = buildMessages(systemPrompt, ctx, prompt);
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
  if (vc.orgId) headers['OpenAI-Organization'] = vc.orgId;
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({ model: vc.model || 'gpt-4o-mini', messages, max_tokens: 1024, temperature: 0.7 }),
  });
  if (!resp.ok) throw new Error('OpenAI HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'No response from OpenAI.';
}

/* ─── Anthropic / Claude ─── */
async function callAnthropic(systemPrompt, ctx, prompt, vc) {
  if (!vc.apiKey) throw new Error('Anthropic API key not configured');
  // Anthropic uses a different message format (system is separate)
  const messages = [];
  for (const entry of ctx) {
    messages.push({ role: entry.role, content: entry.content });
  }
  messages.push({ role: 'user', content: prompt });
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': vc.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: vc.model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  });
  if (!resp.ok) throw new Error('Anthropic HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  const blocks = data.content || [];
  return blocks.map(b => b.text || '').join('\n') || 'No response from Claude.';
}

/* ─── Google / Gemini ─── */
async function callGemini(systemPrompt, ctx, prompt, vc) {
  if (!vc.apiKey) throw new Error('Google AI API key not configured');
  const model = vc.model || 'gemini-2.0-flash';
  const contents = [];
  // System instruction via systemInstruction field
  for (const entry of ctx) {
    contents.push({ role: entry.role === 'assistant' ? 'model' : 'user', parts: [{ text: entry.content }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + vc.apiKey;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
    }),
  });
  if (!resp.ok) throw new Error('Gemini HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || '').join('\n') || 'No response from Gemini.';
}

/* ─── xAI / Grok (OpenAI-compatible) ─── */
async function callXAI(systemPrompt, ctx, prompt, vc) {
  if (!vc.apiKey) throw new Error('xAI API key not configured');
  const messages = buildMessages(systemPrompt, ctx, prompt);
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + vc.apiKey },
    body: JSON.stringify({ model: vc.model || 'grok-3', messages, max_tokens: 1024, temperature: 0.7 }),
  });
  if (!resp.ok) throw new Error('xAI HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'No response from Grok.';
}

/* ─── DeepSeek (OpenAI-compatible) ─── */
async function callDeepSeek(systemPrompt, ctx, prompt, vc) {
  if (!vc.apiKey) throw new Error('DeepSeek API key not configured');
  const messages = buildMessages(systemPrompt, ctx, prompt);
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + vc.apiKey },
    body: JSON.stringify({ model: vc.model || 'deepseek-chat', messages, max_tokens: 1024, temperature: 0.7 }),
  });
  if (!resp.ok) throw new Error('DeepSeek HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'No response from DeepSeek.';
}

/* ─── Ollama (local, OpenAI-compatible) ─── */
function isLocalUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
      || host === '0.0.0.0' || host.endsWith('.local');
  } catch { return false; }
}

async function callOllama(systemPrompt, ctx, prompt, vc) {
  const endpoint = (vc.endpoint || 'http://localhost:11434').replace(/\/+$/, '');
  if (!isLocalUrl(endpoint)) throw new Error('Ollama endpoint must be a local address (localhost/127.0.0.1)');
  if (!vc.model) throw new Error('Ollama model not specified');
  const messages = buildMessages(systemPrompt, ctx, prompt);
  const resp = await fetch(endpoint + '/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: vc.model, messages, stream: false }),
  });
  if (!resp.ok) throw new Error('Ollama HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  return data.message?.content || 'No response from Ollama.';
}

/* ─── Mistral AI (OpenAI-compatible) ─── */
async function callMistral(systemPrompt, ctx, prompt, vc) {
  if (!vc.apiKey) throw new Error('Mistral API key not configured');
  const messages = buildMessages(systemPrompt, ctx, prompt);
  const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + vc.apiKey },
    body: JSON.stringify({ model: vc.model || 'mistral-large-latest', messages, max_tokens: 1024, temperature: 0.7 }),
  });
  if (!resp.ok) throw new Error('Mistral HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'No response from Mistral.';
}

/* ─── Cohere ─── */
async function callCohere(systemPrompt, ctx, prompt, vc) {
  if (!vc.apiKey) throw new Error('Cohere API key not configured');
  const chatHistory = [];
  for (const entry of ctx) {
    chatHistory.push({ role: entry.role, content: entry.content });
  }
  const resp = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + vc.apiKey },
    body: JSON.stringify({
      model: vc.model || 'command-r-plus',
      messages: [
        { role: 'system', content: systemPrompt },
        ...chatHistory,
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!resp.ok) throw new Error('Cohere HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  return data.message?.content?.[0]?.text || 'No response from Cohere.';
}

/* ─── Perplexity (OpenAI-compatible) ─── */
async function callPerplexity(systemPrompt, ctx, prompt, vc) {
  if (!vc.apiKey) throw new Error('Perplexity API key not configured');
  const messages = buildMessages(systemPrompt, ctx, prompt);
  const resp = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + vc.apiKey },
    body: JSON.stringify({ model: vc.model || 'sonar-pro', messages, max_tokens: 1024, temperature: 0.7 }),
  });
  if (!resp.ok) throw new Error('Perplexity HTTP ' + resp.status + ': ' + await resp.text());
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'No response from Perplexity.';
}

/* ───── Context management endpoint ───── */
async function handleContextClear(req, res) {
  let body = '';
  for await (const chunk of req) body += chunk;
  let parsed;
  try { parsed = JSON.parse(body); } catch { parsed = {}; }
  const { agentId } = parsed;
  if (agentId) {
    clearAgentContextServer(agentId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cleared: agentId }));
  } else {
    // Clear all
    agentContexts.clear();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cleared: 'all' }));
  }
}

/* ───── Static file server ───── */
async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (urlPath === '/') urlPath = '/index.html';

  // Prevent directory traversal
  const filePath = resolve(join(__dirname, urlPath));
  if (!filePath.startsWith(resolve(__dirname))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      // Try index.html inside that directory
      const indexPath = join(filePath, 'index.html');
      const indexData = await readFile(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
      res.end(indexData);
      return;
    }
    const data = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + urlPath);
  }
}

/* ───── Generic API proxy for live MCP adapters ───── */
async function readBody(req) {
  let body = '';
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new Error('Request body too large');
    body += chunk;
  }
  try { return JSON.parse(body); } catch { return {}; }
}

function jsonResponse(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/* Slack API proxy */
async function handleSlackProxy(req, res) {
  const { botToken, action, channel, text, query } = await readBody(req);
  if (!botToken) return jsonResponse(res, 400, { error: 'Missing botToken' });
  const headers = { 'Authorization': 'Bearer ' + botToken, 'Content-Type': 'application/json' };
  try {
    let url, fetchBody;
    switch (action) {
      case 'list_channels':
        url = 'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100';
        break;
      case 'send_message':
        url = 'https://slack.com/api/chat.postMessage';
        fetchBody = JSON.stringify({ channel: channel || '#general', text: text || '' });
        break;
      case 'read_channel':
        url = 'https://slack.com/api/conversations.history?channel=' + encodeURIComponent(channel || '') + '&limit=20';
        break;
      case 'search_messages':
        url = 'https://slack.com/api/search.messages?query=' + encodeURIComponent(query || '') + '&count=10';
        break;
      default:
        url = 'https://slack.com/api/conversations.list?limit=10';
    }
    const resp = await fetch(url, { method: fetchBody ? 'POST' : 'GET', headers, body: fetchBody });
    const data = await resp.json();
    jsonResponse(res, 200, data);
  } catch (e) {
    jsonResponse(res, 502, { error: 'Slack API error: ' + e.message });
  }
}

/* Stripe API proxy */
async function handleStripeProxy(req, res) {
  const { secretKey, action, limit } = await readBody(req);
  if (!secretKey) return jsonResponse(res, 400, { error: 'Missing secretKey' });
  const headers = { 'Authorization': 'Bearer ' + secretKey };
  try {
    let url;
    switch (action) {
      case 'list_payments': url = 'https://api.stripe.com/v1/charges?limit=' + (limit || 10); break;
      case 'list_subscriptions': url = 'https://api.stripe.com/v1/subscriptions?limit=' + (limit || 10); break;
      case 'get_balance': url = 'https://api.stripe.com/v1/balance'; break;
      case 'list_customers': url = 'https://api.stripe.com/v1/customers?limit=' + (limit || 10); break;
      default: url = 'https://api.stripe.com/v1/charges?limit=5';
    }
    const resp = await fetch(url, { headers });
    const data = await resp.json();
    jsonResponse(res, 200, data);
  } catch (e) {
    jsonResponse(res, 502, { error: 'Stripe API error: ' + e.message });
  }
}

/* Email (SendGrid) API proxy */
async function handleEmailProxy(req, res) {
  const { apiKey, action, to, from, subject, html, text } = await readBody(req);
  if (!apiKey) return jsonResponse(res, 400, { error: 'Missing apiKey' });
  const headers = { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' };
  try {
    if (action === 'send_email') {
      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST', headers,
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: { email: from || 'noreply@app.com' },
          subject: subject || 'No Subject',
          content: [{ type: 'text/plain', value: text || html || '' }],
        }),
      });
      jsonResponse(res, resp.status, { ok: resp.ok, status: resp.status });
    } else if (action === 'get_stats') {
      const resp = await fetch('https://api.sendgrid.com/v3/stats?start_date=2026-03-01', { headers });
      const data = await resp.json();
      jsonResponse(res, 200, data);
    } else {
      jsonResponse(res, 400, { error: 'Unknown email action: ' + action });
    }
  } catch (e) {
    jsonResponse(res, 502, { error: 'Email API error: ' + e.message });
  }
}

/* OpenClaw Gateway proxy — sends message via HTTP (Gateway REST fallback) */
async function handleOpenClawProxy(req, res) {
  const { gatewayUrl, authToken, sessionId, message } = await readBody(req);
  if (!gatewayUrl) return jsonResponse(res, 400, { error: 'Missing gatewayUrl' });
  try {
    // Convert ws:// to http:// for REST endpoint
    const httpUrl = gatewayUrl.replace(/^ws:/, 'http:').replace(/^wss:/, 'https:');
    if (!isLocalUrl(httpUrl)) return jsonResponse(res, 400, { error: 'OpenClaw gateway must be a local address' });
    const url = httpUrl.replace(/\/+$/, '') + '/api/message';
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
    const resp = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify({ session: sessionId || 'main', message: message || '' }),
    });
    const data = await resp.json();
    jsonResponse(res, 200, data);
  } catch (e) {
    jsonResponse(res, 502, { error: 'OpenClaw Gateway error: ' + e.message });
  }
}

/* ───── Terminal command execution ───── */
import { execFile } from 'node:child_process';

async function handleTerminalExec(req, res) {
  const { command, shell } = await readBody(req);
  if (!command || typeof command !== 'string') return jsonResponse(res, 400, { error: 'Missing command' });
  if (command.length > 1000) return jsonResponse(res, 400, { error: 'Command too long (max 1000 chars)' });
  const sh = shell || 'powershell';
  let prog, args;
  if (sh === 'cmd') { prog = 'cmd'; args = ['/C', command]; }
  else if (sh === 'bash' || sh === 'sh') { prog = sh; args = ['-c', command]; }
  else { prog = 'powershell'; args = ['-NoProfile', '-Command', command]; }
  try {
    const result = await new Promise((resolve, reject) => {
      execFile(prog, args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && err.killed) return reject(new Error('Command timed out'));
        resolve({ stdout: (stdout || '').slice(0, 10240), stderr: (stderr || '').slice(0, 10240), exit_code: err ? err.code || 1 : 0 });
      });
    });
    jsonResponse(res, 200, result);
  } catch (e) {
    jsonResponse(res, 502, { error: 'Terminal error: ' + e.message });
  }
}

/* ───── Router ───── */
const server = createServer((req, res) => {
  // CORS headers for local dev — restrict to same-origin / localhost / Tauri
  const origin = req.headers.origin || '';
  const allowedOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|tauri\.localhost)(:\d+)?$/.test(origin) ? origin : '';
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    handleChatProxy(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/context/clear') {
    handleContextClear(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/slack') {
    handleSlackProxy(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/stripe') {
    handleStripeProxy(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/email') {
    handleEmailProxy(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/openclaw') {
    handleOpenClawProxy(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/terminal') {
    handleTerminalExec(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`🍺 Agent Bar Hangout server running at http://localhost:${PORT}`);
  console.log(`   OpenAI API key: ${OPENAI_API_KEY ? '✓ loaded' : '✗ missing'}`);
});
