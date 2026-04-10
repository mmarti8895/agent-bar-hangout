import assert from 'assert';

const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}`;

async function post(path, body) {
  const resp = await globalThis.fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  return { status: resp.status, data };
}

async function run() {
  console.log('Testing context clear...');
  const r1 = await post('/api/context/clear', { agentId: 'agent-1' });
  assert.strictEqual(r1.status, 200);
  assert.strictEqual(r1.data.cleared, 'agent-1');

  const r2 = await post('/api/context/clear', {});
  assert.strictEqual(r2.status, 200);
  assert.strictEqual(r2.data.cleared, 'all');
  console.log('Context clear passed.');
}

run().catch(e => { console.error(e); process.exit(1); });
