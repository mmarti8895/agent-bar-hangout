const { spawnSync, spawn } = require('child_process');
const fetch = globalThis.fetch || require('node-fetch');

const SERVER_CMD = 'node';
const SERVER_ARGS = ['server.js'];
const COVERAGE_PORT = process.env.COVERAGE_PORT || 18181;
const BASE = `http://localhost:${COVERAGE_PORT}`;

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
  console.log('Checking for existing server, starting if needed...');
  // Spawn a fresh server on the coverage port so we can collect coverage reliably.
  console.log('Spawning server for coverage run on port', COVERAGE_PORT);
  const serverEnv = { ...process.env, PORT: String(COVERAGE_PORT) };
  let server = spawn(SERVER_CMD, SERVER_ARGS, { env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  server.stderr.on('data', d => process.stderr.write(`[server] ${d}`));

  let ready = await waitForHealth(15000);
  if (!ready) {
    console.error('Server did not become healthy in time.');
    try { server.kill(); } catch (e) {}
    process.exit(2);
  }

  console.log('Server healthy — running unit tests sequentially under coverage...');
  const tests = [
    'tests/unit/memory.spec.mjs',
    'tests/unit/hermes.spec.mjs',
    'tests/unit/memory_edges.spec.mjs',
    'tests/unit/hermes_delete.spec.mjs',
    'tests/unit/context.spec.mjs',
    'tests/unit/proxies.spec.mjs',
  ];
  let exitCode = 0;
  for (const t of tests) {
    console.log('\nRunning ' + t + '\n');
    const r = spawnSync('node', [t], { stdio: 'inherit', env: { ...process.env, PORT: String(COVERAGE_PORT) } });
    if (r.status !== 0) exitCode = r.status || 1;
  }

  if (server) {
    console.log('Shutting spawned server down via HTTP endpoint...');
    try {
      await fetch(BASE + '/__shutdown', { method: 'POST' });
      // allow the server some time to close sockets
      await sleep(1000);
    } catch (e) {
      // fallback: hard kill
      try { server.kill(); } catch (e) {}
    }
  } else {
    console.log('Leaving pre-existing server running.');
  }

  process.exit(exitCode);
})();
