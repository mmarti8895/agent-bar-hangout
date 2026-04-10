import assert from 'assert';

const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}`;

async function post(path, body) {
  const resp = await globalThis.fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  return { status: resp.status, data };
}

async function run() {
  console.log('Testing hermes delete...');
  const payload = { taskId: 'to-delete', title: 'Del me' };
  const r1 = await post('/api/hermes/assign', payload);
  assert.strictEqual(r1.status, 200);
  const del = await post('/api/hermes/delete', { taskId: 'to-delete' });
  assert.strictEqual(del.status, 200);
  assert.strictEqual(del.data.ok, true);
  console.log('Hermes delete passed.');
}

run().catch(e => { console.error(e); process.exit(1); });
