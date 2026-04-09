/**
 * Simple integration test for Hermes memory endpoints.
 * Run: node tests/unit/memory.spec.mjs
 */

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL: ' + msg);
    process.exit(1);
  }
  console.log('✅ ' + msg);
}

const BASE = 'http://localhost:8080';
async function postJson(path, body) {
  const res = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return res.json();
}

(async () => {
  console.log('Posting hermes assign...');
  const task = { taskId: 'mem-test-1', title: 'Memory Test Task', instructions: 'Do nothing', targetAgent: 'Nova' };
  const assign = await postJson('/api/hermes/assign', task);
  assert(assign && assign.ok, 'Hermes assign returned ok');

  console.log('Fetching hermes_tasks...');
  const mem = await postJson('/api/memory/get', { key: 'hermes_tasks' });
  assert(mem && Array.isArray(mem.value), 'hermes_tasks exists and is array');
  const found = mem.value.some(t => t.id === 'mem-test-1');
  assert(found, 'Assigned task present in hermes_tasks');

  console.log('Clearing memory store...');
  const clr = await postJson('/api/memory/clear', {});
  assert(clr && clr.ok, 'Memory clear returned ok');

  console.log('Verifying memory is empty...');
  const full = await postJson('/api/memory/get', {});
  const keys = Object.keys(full.store || {});
  assert(keys.length === 0, 'Memory store is empty after clear');

  console.log('\nAll memory integration tests passed.');
  process.exit(0);
})();
