import Database from 'better-sqlite3';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const DEFAULT_DB_FILE = process.env.PERSISTENCE_DB_PATH || join(__dirname, 'agent-bar-hangout.db');
const DEFAULT_MEMORY_FILE = process.env.PERSISTENCE_MEMORY_FILE_PATH || join(__dirname, 'memories.json');
const MIGRATION_KEY = 'memories_json_v1';

function nowIso() {
  return new Date().toISOString();
}

function parseJsonOr(value, fallback) {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  return JSON.stringify(value == null ? null : value);
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeStatus(status, fallback = 'in_progress') {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === 'in-progress') return 'in_progress';
  if (raw === 'completed') return 'done';
  return raw;
}

function mapTaskRow(row) {
  const mcpIds = parseJsonOr(row.mcp_ids_json, []);
  const status = normalizeStatus(row.status);
  return {
    id: row.id,
    source: row.source,
    agentId: row.agent_id ?? null,
    assignee: row.agent_id ?? null,
    label: row.title,
    title: row.title,
    instructions: row.instructions ?? '',
    etaMinutes: row.eta_minutes ?? null,
    mcpIds,
    metadata: parseJsonOr(row.metadata_json, {}),
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    receivedAt: row.received_at ?? null,
    completedAt: row.completed_at ?? null,
    log: [],
    totalSteps: 2 + mcpIds.length * 2 + 2,
  };
}

function normalizeTaskInput(task, overrides = {}) {
  const timestamp = nowIso();
  const source = overrides.source || task.source || 'manual';
  const status = normalizeStatus(
    overrides.status || task.status || (source === 'hermes' ? 'pending' : 'in_progress'),
    source === 'hermes' ? 'pending' : 'in_progress',
  );
  const createdAt = task.createdAt || task.receivedAt || timestamp;
  const updatedAt = overrides.updatedAt || task.updatedAt || timestamp;
  const receivedAt = source === 'hermes' ? (task.receivedAt || timestamp) : (task.receivedAt ?? null);
  return {
    id: task.id,
    source,
    agent_id: overrides.agentId ?? task.agentId ?? task.assignee ?? null,
    title: task.title || task.label || 'Untitled Task',
    instructions: task.instructions || '',
    eta_minutes: task.etaMinutes ?? null,
    mcp_ids_json: toJson(task.mcpIds || []),
    metadata_json: toJson(task.metadata || {}),
    status,
    created_at: createdAt,
    updated_at: updatedAt,
    received_at: receivedAt,
    completed_at: status === 'done' ? (task.completedAt || timestamp) : (task.completedAt ?? null),
  };
}

export function createPersistence(options = {}) {
  const dbPath = options.dbPath || DEFAULT_DB_FILE;
  const memoryFilePath = options.memoryFilePath || DEFAULT_MEMORY_FILE;
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      agent_id TEXT,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      eta_minutes INTEGER,
      mcp_ids_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      received_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS migration_records (
      migration_key TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      source_hash TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      details_json TEXT NOT NULL
    );
  `);

  const statements = {
    upsertMemory: database.prepare(`
      INSERT INTO memory_entries (key, value_json, updated_at)
      VALUES (@key, @value_json, @updated_at)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `),
    getMemory: database.prepare('SELECT key, value_json FROM memory_entries WHERE key = ?'),
    listMemory: database.prepare('SELECT key, value_json FROM memory_entries ORDER BY key'),
    deleteMemory: database.prepare('DELETE FROM memory_entries WHERE key = ?'),
    clearMemory: database.prepare('DELETE FROM memory_entries'),
    upsertTask: database.prepare(`
      INSERT INTO tasks (
        id, source, agent_id, title, instructions, eta_minutes,
        mcp_ids_json, metadata_json, status, created_at, updated_at,
        received_at, completed_at
      ) VALUES (
        @id, @source, @agent_id, @title, @instructions, @eta_minutes,
        @mcp_ids_json, @metadata_json, @status, @created_at, @updated_at,
        @received_at, @completed_at
      )
      ON CONFLICT(id) DO UPDATE SET
        source = excluded.source,
        agent_id = excluded.agent_id,
        title = excluded.title,
        instructions = excluded.instructions,
        eta_minutes = excluded.eta_minutes,
        mcp_ids_json = excluded.mcp_ids_json,
        metadata_json = excluded.metadata_json,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        received_at = excluded.received_at,
        completed_at = excluded.completed_at
    `),
    getTask: database.prepare('SELECT * FROM tasks WHERE id = ?'),
    deleteTask: database.prepare('DELETE FROM tasks WHERE id = ?'),
    listPendingHermes: database.prepare(`
      SELECT * FROM tasks
      WHERE source = 'hermes' AND status = 'pending'
      ORDER BY received_at ASC, created_at ASC
    `),
    deletePendingHermes: database.prepare(`
      DELETE FROM tasks WHERE source = 'hermes' AND status = 'pending'
    `),
    deleteRejectedTasks: database.prepare(`
      DELETE FROM tasks WHERE source = 'hermes' AND status = 'rejected'
    `),
    bootstrapRows: database.prepare(`
      SELECT * FROM tasks
      WHERE status IN ('pending', 'in_progress', 'done')
      ORDER BY created_at ASC
    `),
    latestMigration: database.prepare(`
      SELECT * FROM migration_records
      WHERE migration_key = ?
    `),
    upsertMigration: database.prepare(`
      INSERT INTO migration_records (
        migration_key, source_path, source_hash, status, started_at, completed_at, details_json
      ) VALUES (
        @migration_key, @source_path, @source_hash, @status, @started_at, @completed_at, @details_json
      )
      ON CONFLICT(migration_key) DO UPDATE SET
        source_path = excluded.source_path,
        source_hash = excluded.source_hash,
        status = excluded.status,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at,
        details_json = excluded.details_json
    `),
  };

  function recordMigration(payload) {
    statements.upsertMigration.run({
      migration_key: MIGRATION_KEY,
      source_path: payload.sourcePath,
      source_hash: payload.sourceHash || null,
      status: payload.status,
      started_at: payload.startedAt,
      completed_at: payload.completedAt || null,
      details_json: toJson(payload.details || {}),
    });
  }

  function getMigrationInfo() {
    const row = statements.latestMigration.get(MIGRATION_KEY);
    if (!row) return null;
    return {
      migrationKey: row.migration_key,
      sourcePath: row.source_path,
      sourceHash: row.source_hash,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      details: parseJsonOr(row.details_json, {}),
    };
  }

  function replacePendingHermes(tasks) {
    const timestamp = nowIso();
    const transaction = database.transaction((nextTasks) => {
      statements.deletePendingHermes.run();
      for (const task of nextTasks) {
        statements.upsertTask.run(normalizeTaskInput(task, {
          source: 'hermes',
          status: 'pending',
          updatedAt: timestamp,
        }));
      }
      statements.deleteRejectedTasks.run();
    });
    transaction(tasks || []);
    return getPendingHermesTasks();
  }

  function getPendingHermesTasks() {
    return statements.listPendingHermes.all().map((row) => {
      const task = mapTaskRow(row);
      return {
        id: task.id,
        title: task.title,
        instructions: task.instructions,
        etaMinutes: task.etaMinutes,
        assignee: task.assignee,
        metadata: task.metadata,
        receivedAt: task.receivedAt,
      };
    });
  }

  function getMemoryStore() {
    const store = {};
    for (const row of statements.listMemory.all()) {
      store[row.key] = parseJsonOr(row.value_json, null);
    }
    const hermesTasks = getPendingHermesTasks();
    if (hermesTasks.length) {
      store.hermes_tasks = hermesTasks;
    }
    return store;
  }

  function getMemoryValue(key) {
    if (key === 'hermes_tasks') {
      const tasks = getPendingHermesTasks();
      return tasks.length ? tasks : undefined;
    }
    const row = statements.getMemory.get(key);
    return row ? parseJsonOr(row.value_json, null) : undefined;
  }

  function setMemoryValue(key, value) {
    if (!key || typeof key !== 'string') {
      throw new Error('Missing key');
    }
    if (key.length > 256) {
      throw new Error('Key length exceeds 256 characters');
    }
    const serialized = JSON.stringify(value === undefined ? null : value);
    if (serialized.length > 200 * 1024) {
      throw new Error('Value too large (max 200KB)');
    }
    if (key === 'hermes_tasks') {
      if (!Array.isArray(value)) {
        throw new Error('hermes_tasks must be an array');
      }
      replacePendingHermes(value);
      return;
    }
    statements.upsertMemory.run({
      key,
      value_json: serialized,
      updated_at: nowIso(),
    });
  }

  function deleteMemoryValue(key) {
    if (!key) {
      throw new Error('Missing key');
    }
    if (key === 'hermes_tasks') {
      statements.deletePendingHermes.run();
      return;
    }
    statements.deleteMemory.run(key);
  }

  function listMemoryKeys() {
    const keys = statements.listMemory.all().map((row) => row.key);
    if (getPendingHermesTasks().length) {
      keys.push('hermes_tasks');
    }
    return keys;
  }

  function clearMemoryStore() {
    statements.clearMemory.run();
    statements.deletePendingHermes.run();
  }

  function upsertTask(task) {
    const normalized = normalizeTaskInput(task);
    statements.upsertTask.run(normalized);
    return mapTaskRow(statements.getTask.get(normalized.id));
  }

  function transitionTask({ taskId, status, agentId = null, completedAt = null }) {
    const existing = statements.getTask.get(taskId);
    if (!existing) {
      throw new Error('Task not found');
    }
    const nextTask = mapTaskRow(existing);
    nextTask.status = status;
    if (agentId !== null) {
      nextTask.agentId = agentId;
      nextTask.assignee = agentId;
    }
    if (completedAt !== null) {
      nextTask.completedAt = completedAt;
    } else if (status === 'done') {
      nextTask.completedAt = nowIso();
    }
    const normalized = normalizeTaskInput(nextTask, {
      status,
      agentId: nextTask.agentId,
      updatedAt: nowIso(),
    });
    if (status !== 'done') {
      normalized.completed_at = null;
    }
    statements.upsertTask.run(normalized);
    return mapTaskRow(statements.getTask.get(taskId));
  }

  function deleteTask(taskId) {
    return statements.deleteTask.run(taskId).changes;
  }

  function assignHermesTask(payload = {}) {
    const timestamp = nowIso();
    const task = {
      id: payload.taskId || payload.id || payload.task?.id || `t_${Date.now()}`,
      title: payload.title || payload.task?.title || payload.summary || 'Hermes Task',
      instructions: payload.instructions || payload.task?.instructions || payload.description || '',
      etaMinutes: payload.etaMinutes || payload.task?.eta || payload.eta || null,
      assignee: payload.targetAgent || payload.assignee || payload.task?.assignee || null,
      metadata: payload.metadata || payload.meta || {},
      receivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      source: 'hermes',
      status: 'pending',
    };
    const stored = upsertTask(task);
    return {
      id: stored.id,
      title: stored.title,
      instructions: stored.instructions,
      etaMinutes: stored.etaMinutes,
      assignee: stored.assignee,
      metadata: stored.metadata,
      receivedAt: stored.receivedAt,
    };
  }

  function deleteHermesTask(taskId) {
    const existing = statements.getTask.get(taskId);
    if (!existing || existing.source !== 'hermes' || existing.status !== 'pending') {
      return 0;
    }
    return statements.deleteTask.run(taskId).changes;
  }

  function getBootstrap(agentIds = []) {
    const grouped = new Map(agentIds.map((agentId) => [agentId, { agentId, tasks: [], history: [] }]));
    for (const row of statements.bootstrapRows.all()) {
      const task = mapTaskRow(row);
      if (task.status === 'pending' && task.source === 'hermes') continue;
      const agentId = task.agentId;
      if (!agentId) continue;
      if (!grouped.has(agentId)) {
        grouped.set(agentId, { agentId, tasks: [], history: [] });
      }
      if (task.status === 'done') {
        grouped.get(agentId).history.unshift(task);
      } else if (task.status === 'in_progress' || task.status === 'verifying') {
        grouped.get(agentId).tasks.push(task);
      }
    }
    return {
      agents: Array.from(grouped.values()),
      hermesTasks: getPendingHermesTasks(),
      migration: getMigrationInfo(),
    };
  }

  function countMemoryKeys() {
    return listMemoryKeys().length;
  }

  async function migrateFromLegacyFile() {
    const existing = getMigrationInfo();
    if (existing?.status === 'completed') {
      return existing;
    }

    let raw;
    try {
      raw = await readFile(memoryFilePath, 'utf-8');
    } catch {
      return existing;
    }

    const startedAt = nowIso();
    const sourceHash = hashText(raw);
    recordMigration({
      sourcePath: memoryFilePath,
      sourceHash,
      status: 'pending',
      startedAt,
      details: { importedKeys: 0, importedHermesTasks: 0 },
    });

    try {
      const parsed = JSON.parse(raw || '{}');
      const keys = Object.keys(parsed || {});
      let importedKeys = 0;
      let importedHermesTasks = 0;

      const transaction = database.transaction(() => {
        for (const key of keys) {
          if (key === 'hermes_tasks') {
            const tasks = Array.isArray(parsed[key]) ? parsed[key] : [];
            replacePendingHermes(tasks);
            importedHermesTasks = tasks.length;
            continue;
          }
          statements.upsertMemory.run({
            key,
            value_json: toJson(parsed[key]),
            updated_at: startedAt,
          });
          importedKeys++;
        }
      });

      transaction();
      const completedAt = nowIso();
      recordMigration({
        sourcePath: memoryFilePath,
        sourceHash,
        status: 'completed',
        startedAt,
        completedAt,
        details: { importedKeys, importedHermesTasks },
      });
      return getMigrationInfo();
    } catch (error) {
      recordMigration({
        sourcePath: memoryFilePath,
        sourceHash,
        status: 'failed',
        startedAt,
        completedAt: nowIso(),
        details: { error: error.message },
      });
      throw error;
    }
  }

  return {
    dbPath,
    memoryFilePath,
    migrateFromLegacyFile,
    getMemoryStore,
    getMemoryValue,
    setMemoryValue,
    listMemoryKeys,
    deleteMemoryValue,
    clearMemoryStore,
    upsertTask,
    transitionTask,
    deleteTask,
    assignHermesTask,
    deleteHermesTask,
    getPendingHermesTasks,
    getBootstrap,
    getMigrationInfo,
    countMemoryKeys,
    close() {
      database.close();
    },
  };
}
