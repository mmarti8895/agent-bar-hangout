import assert from 'assert';

const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}`;

async function post(path, body) {
  const resp = await globalThis.fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  return { status: resp.status, data };
}

async function run() {
  console.log('Testing memory edge cases...');

  // Missing key
  const miss = await post('/api/memory/set', { value: 1 });
  assert.strictEqual(miss.status, 400, 'Missing key should return 400');

  // Non-string key
  const nonstr = await post('/api/memory/set', { key: 123, value: { x: 2 } });
  assert.strictEqual(nonstr.status, 400, 'Non-string key should return 400');

  // Set then list keys
  const set = await post('/api/memory/set', { key: 'edgeKey', value: { ok: true } });
  assert.strictEqual(set.status, 200);
  const keys = await post('/api/memory/keys', {});
  assert.strictEqual(keys.status, 200);
  assert.ok(Array.isArray(keys.data.keys));
  const found = keys.data.keys.includes('edgeKey');
  assert.ok(found, 'edgeKey present in keys');

  // Delete non-existent key should still return ok
  const del = await post('/api/memory/delete', { key: 'no-such' });
  assert.strictEqual(del.status, 200);

  console.log('Memory edge tests passed.');
}

run().catch(e => { console.error(e); process.exit(1); });
