import assert from 'assert';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createPersistence } from '../../persistence.js';

async function run() {
  const root = await mkdtemp(join(os.tmpdir(), 'agent-bar-persistence-'));
  const persistence = createPersistence({
    dbPath: join(root, 'state.db'),
    memoryFilePath: join(root, 'memories.json'),
  });

  try {
    persistence.setMemoryValue('alpha', { ok: true });
    assert.deepStrictEqual(persistence.getMemoryValue('alpha'), { ok: true });
    assert.ok(persistence.listMemoryKeys().includes('alpha'));

    const task = persistence.upsertTask({
      id: 'task-1',
      source: 'manual',
      agentId: 'nova',
      title: 'Persist me',
      instructions: 'Keep this task',
      etaMinutes: 5,
      mcpIds: ['filesystem'],
      metadata: { priority: 'high' },
      status: 'in-progress',
      createdAt: new Date().toISOString(),
    });
    assert.strictEqual(task.status, 'in_progress');

    const bootstrap = persistence.getBootstrap(['nova']);
    assert.strictEqual(bootstrap.agents.length, 1);
    assert.strictEqual(bootstrap.agents[0].tasks.length, 1);
    assert.strictEqual(bootstrap.agents[0].tasks[0].id, 'task-1');

    const done = persistence.transitionTask({ taskId: 'task-1', status: 'done', agentId: 'nova' });
    assert.strictEqual(done.status, 'done');
    assert.ok(done.completedAt);

    const afterDone = persistence.getBootstrap(['nova']);
    assert.strictEqual(afterDone.agents[0].tasks.length, 0);
    assert.strictEqual(afterDone.agents[0].history.length, 1);

    const hermes = persistence.assignHermesTask({
      taskId: 'hermes-1',
      title: 'Incoming',
      instructions: 'Handle it',
      targetAgent: 'quinn',
      metadata: { queue: 'incoming' },
    });
    assert.strictEqual(hermes.id, 'hermes-1');
    const queued = persistence.getMemoryValue('hermes_tasks');
    assert.ok(Array.isArray(queued));
    assert.strictEqual(queued.length, 1);
    assert.strictEqual(persistence.deleteHermesTask('hermes-1'), 1);

    persistence.deleteMemoryValue('alpha');
    assert.strictEqual(persistence.getMemoryValue('alpha'), undefined);
    persistence.clearMemoryStore();
    assert.deepStrictEqual(persistence.getMemoryStore(), {});

    console.log('Persistence core tests passed.');
  } finally {
    persistence.close();
    await rm(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
