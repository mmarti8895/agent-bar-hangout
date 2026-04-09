const { spawnSync, spawn } = require('child_process');
const fetch = globalThis.fetch || require('node-fetch');

const SERVER_CMD = 'node';
const SERVER_ARGS = ['server.js'];
const BASE = 'http://localhost:8080';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForHealth(timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + '/health');
      if (r.ok) return true;
    } catch (e) { }
    await sleep(200);
  }
  return false;
}

(async () => {
  console.log('Starting server for coverage run...');
  const server = spawn(SERVER_CMD, SERVER_ARGS, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`[server] ${d}`));

  const ready = await waitForHealth(15000);
  if (!ready) {
    console.error('Server did not become healthy in time.');
    server.kill();
    process.exit(2);
  }

  console.log('Server healthy — running unit tests sequentially under coverage...');
  const tests = ['tests/unit/memory.spec.mjs', 'tests/unit/hermes.spec.mjs'];
  let exitCode = 0;
  for (const t of tests) {
    console.log('\nRunning ' + t + '\n');
    const r = spawnSync('node', [t], { stdio: 'inherit', env: process.env });
    if (r.status !== 0) exitCode = r.status || 1;
  }

  console.log('Killing server...');
  server.kill();
  process.exit(exitCode);
})();
