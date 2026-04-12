import assert from 'assert';
import { createServer } from 'node:http';

const PORT = process.env.PORT || 8080;
const BASE = `http://localhost:${PORT}`;

async function request(path, options = {}) {
  const resp = await fetch(BASE + path, options);
  const text = await resp.text();
  const contentType = resp.headers.get('content-type') || '';
  let data = text;

  if (contentType.includes('application/json') && text) {
    data = JSON.parse(text);
  }

  return { status: resp.status, headers: resp.headers, data, text };
}

async function postJson(path, body, headers = {}) {
  return request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function startOpenClawFixture() {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;

    requests.push({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body ? JSON.parse(body) : {},
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, echoed: requests.at(-1).body }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  return {
    gatewayUrl: `ws://127.0.0.1:${address.port}`,
    requests,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

async function run() {
  console.log('Testing additional endpoint coverage...');

  const clearStart = await postJson('/api/memory/clear', {});
  assert.strictEqual(clearStart.status, 200);

  const health = await request('/health');
  assert.strictEqual(health.status, 200);
  assert.strictEqual(health.data.ok, true);
  assert.strictEqual(health.data.memory_keys, 0);

  const optionsResp = await request('/api/chat', {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:3000' },
  });
  assert.strictEqual(optionsResp.status, 204);
  assert.strictEqual(optionsResp.headers.get('access-control-allow-origin'), 'http://localhost:3000');

  const disallowedOptions = await request('/api/chat', {
    method: 'OPTIONS',
    headers: { Origin: 'https://example.com' },
  });
  assert.strictEqual(disallowedOptions.status, 204);
  assert.notStrictEqual(disallowedOptions.headers.get('access-control-allow-origin'), 'https://example.com');

  const index = await request('/');
  assert.strictEqual(index.status, 200);
  assert.ok(index.text.includes('<!DOCTYPE html>') || index.text.includes('<html'));

  const missing = await request('/does-not-exist.txt');
  assert.strictEqual(missing.status, 404);

  const invalidJson = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid-json',
  });
  assert.strictEqual(invalidJson.status, 400);
  assert.strictEqual(invalidJson.data.error, 'Invalid JSON body');

  const missingPrompt = await postJson('/api/chat', {});
  assert.strictEqual(missingPrompt.status, 400);
  assert.strictEqual(missingPrompt.data.error, 'Missing "prompt" field');

  const oversizedChat = await request('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'x'.repeat(1024 * 1024) }),
  });
  assert.strictEqual(oversizedChat.status, 413);
  assert.strictEqual(oversizedChat.data.error, 'Request body too large');

  const unknownVendor = await postJson('/api/chat', { prompt: 'hello', vendor: 'unknown' });
  assert.strictEqual(unknownVendor.status, 400);
  assert.match(unknownVendor.data.error, /Unknown LLM vendor/);

  const remoteOllama = await postJson('/api/chat', {
    prompt: 'hello',
    vendor: 'ollama',
    vendorConfig: { endpoint: 'https://example.com', model: 'llama3' },
  });
  assert.strictEqual(remoteOllama.status, 502);
  assert.match(remoteOllama.data.error, /Ollama endpoint must be a local address/);

  const missingOllamaModel = await postJson('/api/chat', {
    prompt: 'hello',
    vendor: 'ollama',
    vendorConfig: { endpoint: 'http://localhost:11434' },
  });
  assert.strictEqual(missingOllamaModel.status, 502);
  assert.match(missingOllamaModel.data.error, /Ollama model not specified/);

  const openClawMissing = await postJson('/api/openclaw', {});
  assert.strictEqual(openClawMissing.status, 400);
  assert.strictEqual(openClawMissing.data.error, 'Missing gatewayUrl');

  const openClawRemote = await postJson('/api/openclaw', { gatewayUrl: 'https://example.com/socket' });
  assert.strictEqual(openClawRemote.status, 400);
  assert.strictEqual(openClawRemote.data.error, 'OpenClaw gateway must be a local address');

  const emailUnknown = await postJson('/api/email', { apiKey: 'test-key', action: 'unknown_action' });
  assert.strictEqual(emailUnknown.status, 400);
  assert.match(emailUnknown.data.error, /Unknown email action/);

  const openClawFixture = await startOpenClawFixture();
  try {
    const openClawLocal = await postJson('/api/openclaw', {
      gatewayUrl: openClawFixture.gatewayUrl,
      authToken: 'local-token',
      sessionId: 'coverage-session',
      message: 'ping',
    });
    assert.strictEqual(openClawLocal.status, 200);
    assert.strictEqual(openClawLocal.data.ok, true);
    assert.strictEqual(openClawFixture.requests.length, 1);
    assert.strictEqual(openClawFixture.requests[0].url, '/api/message');
    assert.strictEqual(openClawFixture.requests[0].headers.authorization, 'Bearer local-token');
    assert.deepStrictEqual(openClawFixture.requests[0].body, {
      session: 'coverage-session',
      message: 'ping',
    });
  } finally {
    await openClawFixture.close();
  }

  const terminalMissing = await postJson('/api/terminal', {});
  assert.strictEqual(terminalMissing.status, 400);
  assert.strictEqual(terminalMissing.data.error, 'Missing command');

  const terminalTooLong = await postJson('/api/terminal', { command: 'x'.repeat(1001) });
  assert.strictEqual(terminalTooLong.status, 400);
  assert.match(terminalTooLong.data.error, /Command too long/);

  const terminalOk = await postJson('/api/terminal', { command: 'echo coverage-ok' });
  assert.strictEqual(terminalOk.status, 200);
  assert.strictEqual(terminalOk.data.exit_code, 0);
  assert.match(terminalOk.data.stdout, /coverage-ok/);

  const longKey = await postJson('/api/memory/set', { key: 'k'.repeat(257), value: 1 });
  assert.strictEqual(longKey.status, 400);
  assert.match(longKey.data.error, /Key length exceeds 256 characters/);

  const largeValue = await postJson('/api/memory/set', { key: 'large-value', value: 'x'.repeat(205 * 1024) });
  assert.strictEqual(largeValue.status, 400);
  assert.match(largeValue.data.error, /Value too large/);

  const setNullable = await postJson('/api/memory/set', { key: 'nullable', value: null });
  assert.strictEqual(setNullable.status, 200);

  const invalidMemoryGet = await request('/api/memory/get', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad-json',
  });
  assert.strictEqual(invalidMemoryGet.status, 200);
  assert.ok(typeof invalidMemoryGet.data.store === 'object');

  const getNullable = await postJson('/api/memory/get', { key: 'nullable' });
  assert.strictEqual(getNullable.status, 200);
  assert.strictEqual(getNullable.data.value, null);

  const listKeys = await postJson('/api/memory/keys', {});
  assert.strictEqual(listKeys.status, 200);
  assert.ok(listKeys.data.keys.includes('nullable'));

  const deleteMissingKey = await postJson('/api/memory/delete', {});
  assert.strictEqual(deleteMissingKey.status, 400);
  assert.strictEqual(deleteMissingKey.data.error, 'Missing key');

  const deleteNullable = await postJson('/api/memory/delete', { key: 'nullable' });
  assert.strictEqual(deleteNullable.status, 200);

  const getDeleted = await postJson('/api/memory/get', { key: 'nullable' });
  assert.strictEqual(getDeleted.status, 200);
  assert.ok(!Object.prototype.hasOwnProperty.call(getDeleted.data, 'value'));

  const hermesAssign = await postJson('/api/hermes/assign', {
    taskId: 'hermes-coverage',
    title: 'Coverage task',
    instructions: 'Exercise hermes assign flow',
    etaMinutes: 5,
    targetAgent: 'Nova',
    metadata: { priority: 'low' },
  });
  assert.strictEqual(hermesAssign.status, 200);
  assert.strictEqual(hermesAssign.data.task.id, 'hermes-coverage');

  const hermesStored = await postJson('/api/memory/get', { key: 'hermes_tasks' });
  assert.strictEqual(hermesStored.status, 200);
  assert.ok(Array.isArray(hermesStored.data.value));
  assert.ok(hermesStored.data.value.some((task) => task.id === 'hermes-coverage'));

  const hermesDeleteMissing = await postJson('/api/hermes/delete', {});
  assert.strictEqual(hermesDeleteMissing.status, 400);
  assert.strictEqual(hermesDeleteMissing.data.error, 'Missing taskId');

  const hermesDeleteExisting = await postJson('/api/hermes/delete', { taskId: 'hermes-coverage' });
  assert.strictEqual(hermesDeleteExisting.status, 200);
  assert.strictEqual(hermesDeleteExisting.data.removed, 1);

  const clearMemory = await postJson('/api/memory/clear', {});
  assert.strictEqual(clearMemory.status, 200);

  const hermesDeleteEmpty = await postJson('/api/hermes/delete', { taskId: 'missing-task' });
  assert.strictEqual(hermesDeleteEmpty.status, 404);
  assert.strictEqual(hermesDeleteEmpty.data.error, 'No hermes_tasks');

  const contextInvalidJson = await request('/api/context/clear', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad-json',
  });
  assert.strictEqual(contextInvalidJson.status, 200);
  assert.strictEqual(contextInvalidJson.data.cleared, 'all');

  console.log('Additional endpoint coverage tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});