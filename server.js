/**
 * Lightweight dev server for Agent Bar Hangout.
 * - Serves static files from the project root
 * - Proxies /api/chat to the OpenAI Chat Completions API
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
  console.error('⚠  OPENAI_API_KEY not set. Add it to .env or set as environment variable.');
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

/* ───── OpenAI proxy ───── */
async function handleChatProxy(req, res) {
  if (!OPENAI_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'OPENAI_API_KEY not configured' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  const { prompt, model, agentId } = parsed;
  if (!prompt) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Missing "prompt" field' }));
    return;
  }

  try {
    // Build messages: system → prior context entries → current prompt
    const messages = [
      { role: 'system', content: 'You are a helpful assistant. Provide concise, factual answers. For weather, include current conditions, temperature, humidity, wind, and forecast when possible. For searches, provide relevant factual information with sources when applicable. If the user refers to something from a previous answer, use the conversation history to respond accurately.' },
    ];

    // Inject rolling context for this agent
    const ctx = getAgentContext(agentId);
    for (const entry of ctx) {
      messages.push({ role: entry.role, content: entry.content });
    }

    messages.push({ role: 'user', content: prompt });

    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const errText = await openaiRes.text();
      res.writeHead(openaiRes.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'OpenAI API error: ' + openaiRes.status, details: errText }));
      return;
    }

    const data = await openaiRes.json();
    const answer = data.choices?.[0]?.message?.content || 'No response from ChatGPT.';

    // Store both sides of the conversation in the agent's context
    pushAgentContext(agentId, 'user', prompt);
    pushAgentContext(agentId, 'assistant', answer);

    const ctxCount = getAgentContext(agentId).length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ answer, contextEntries: ctxCount }));
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to reach OpenAI: ' + e.message }));
  }
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

/* ───── Router ───── */
const server = createServer((req, res) => {
  // CORS headers for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
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

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`🍺 Agent Bar Hangout server running at http://localhost:${PORT}`);
  console.log(`   OpenAI API key: ${OPENAI_API_KEY ? '✓ loaded' : '✗ missing'}`);
});
