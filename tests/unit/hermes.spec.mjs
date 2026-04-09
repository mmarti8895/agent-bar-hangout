import assert from 'assert';

const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}`;

async function post(path, body) {
  const resp = await globalThis.fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  return { status: resp.status, data };
}

async function run() {
  console.log('Testing Hermes assign endpoint...');
  const payload = {
    taskId: 'hermes-1',
    title: 'Check inventory',
    instructions: 'Count bottles on shelf A',
    etaMinutes: 15,
    targetAgent: 'Nova',
    metadata: { priority: 'high' }
  };

  const r1 = await post('/api/hermes/assign', payload);
  assert.strictEqual(r1.status, 200, 'Expected 200 from /api/hermes/assign');
  assert.strictEqual(r1.data.ok, true);
  assert.strictEqual(r1.data.task.id, 'hermes-1');
  assert.strictEqual(r1.data.task.title, 'Check inventory');
  console.log('Hermes assign OK');

  console.log('Testing memory get (full store)...');
  const r2 = await post('/api/memory/get', {});
  assert.strictEqual(r2.status, 200);
  assert.ok(r2.data.store);
  console.log('Memory get OK');

  console.log('Testing memory set/get key...');
  const set = await post('/api/memory/set', { key: 'testKey', value: { x: 1 } });
  assert.strictEqual(set.status, 200);
  const get = await post('/api/memory/get', { key: 'testKey' });
  assert.strictEqual(get.status, 200);
  assert.deepStrictEqual(get.data.value, { x: 1 });
  console.log('Memory set/get OK');

  console.log('All Hermes/memory tests passed.');
}

run().catch((e) => { console.error(e); process.exit(1); });
