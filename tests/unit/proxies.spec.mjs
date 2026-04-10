import assert from 'assert';

const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}`;

async function post(path, body) {
  const resp = await globalThis.fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  return { status: resp.status, data };
}

async function run() {
  console.log('Testing proxy auth failures...');

  const slack = await post('/api/slack', { action: 'list_channels' });
  assert.strictEqual(slack.status, 400);

  const stripe = await post('/api/stripe', { action: 'list_payments' });
  assert.strictEqual(stripe.status, 400);

  const email = await post('/api/email', { action: 'get_stats' });
  assert.strictEqual(email.status, 400);

  console.log('Proxy auth failure tests passed.');
}

run().catch(e => { console.error(e); process.exit(1); });
