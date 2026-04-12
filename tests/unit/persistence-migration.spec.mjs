import assert from 'assert';
import os from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPersistence } from '../../persistence.js';

async function run() {
  const root = await mkdtemp(join(os.tmpdir(), 'agent-bar-migration-'));
  const memoryFilePath = join(root, 'memories.json');
  const dbPath = join(root, 'state.db');
  await writeFile(
    memoryFilePath,
    JSON.stringify({
      alpha: { count: 2 },
      nullable: null,
      hermes_tasks: [
        {
          id: 'legacy-hermes',
          title: 'Legacy Hermes',
          instructions: 'Imported from file',
          assignee: 'Nova',
          metadata: { imported: true },
        },
      ],
    }),
    'utf-8',
  );

  const persistence = createPersistence({ dbPath, memoryFilePath });
  try {
    const migration = await persistence.migrateFromLegacyFile();
    assert.strictEqual(migration.status, 'completed');
    assert.strictEqual(migration.details.importedKeys, 2);
    assert.strictEqual(migration.details.importedHermesTasks, 1);
    assert.deepStrictEqual(persistence.getMemoryValue('alpha'), { count: 2 });
    assert.strictEqual(persistence.getMemoryValue('nullable'), null);
    const hermes = persistence.getMemoryValue('hermes_tasks');
    assert.ok(Array.isArray(hermes));
    assert.strictEqual(hermes[0].id, 'legacy-hermes');

    const second = await persistence.migrateFromLegacyFile();
    assert.strictEqual(second.status, 'completed');
    assert.strictEqual(persistence.getPendingHermesTasks().length, 1);

    console.log('Persistence migration tests passed.');
  } finally {
    persistence.close();
    await rm(root, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
