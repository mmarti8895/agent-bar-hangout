use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const DB_FILE: &str = "agent-bar-hangout.db";
const LEGACY_MEMORY_FILE: &str = "memories.json";
const MIGRATION_KEY: &str = "memories_json_v1";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistedTask {
    pub id: String,
    pub source: String,
    pub agent_id: Option<String>,
    pub assignee: Option<String>,
    pub label: String,
    pub title: String,
    pub instructions: String,
    pub eta_minutes: Option<i64>,
    #[serde(default)]
    pub mcp_ids: Vec<String>,
    #[serde(default)]
    pub metadata: Map<String, Value>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub received_at: Option<String>,
    pub completed_at: Option<String>,
    #[serde(default)]
    pub log: Vec<Value>,
    pub total_steps: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentBootstrap {
    pub agent_id: String,
    #[serde(default)]
    pub tasks: Vec<PersistedTask>,
    #[serde(default)]
    pub history: Vec<PersistedTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MigrationInfo {
    pub migration_key: String,
    pub source_path: String,
    pub source_hash: Option<String>,
    pub status: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    #[serde(default)]
    pub details: Map<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapResponse {
    #[serde(default)]
    pub agents: Vec<AgentBootstrap>,
    #[serde(default)]
    pub hermes_tasks: Vec<PersistedTask>,
    pub migration: Option<MigrationInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskResponse {
    pub ok: bool,
    pub task: PersistedTask,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveResponse {
    pub ok: bool,
    pub removed: usize,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MemoryResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub value: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub store: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryKeysResponse {
    pub keys: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskTransitionRequest {
    pub task_id: String,
    pub status: String,
    pub agent_id: Option<String>,
    pub completed_at: Option<String>,
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn normalize_status(status: &str, fallback: &str) -> String {
    let raw = status.trim().to_lowercase();
    if raw.is_empty() {
        fallback.to_string()
    } else if raw == "in-progress" {
        "in_progress".to_string()
    } else if raw == "completed" {
        "done".to_string()
    } else {
        raw
    }
}

fn parse_json_value(raw: &str) -> Value {
    serde_json::from_str(raw).unwrap_or(Value::Null)
}

fn parse_json_array(raw: &str) -> Vec<String> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn parse_json_map(raw: &str) -> Map<String, Value> {
    serde_json::from_str(raw).unwrap_or_default()
}

fn to_json_string<T: Serialize>(value: &T) -> Result<String, String> {
    serde_json::to_string(value).map_err(|e| e.to_string())
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| format!("App data path error: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(DB_FILE))
}

fn legacy_memory_path() -> Result<PathBuf, String> {
    Ok(std::env::current_dir().map_err(|e| e.to_string())?.join(LEGACY_MEMORY_FILE))
}

fn open_connection(db_path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON").map_err(|e| e.to_string())?;
    conn.execute_batch(
        "
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
        ",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn with_connection<T, F>(app: &AppHandle, op: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let db_path = database_path(app)?;
    let legacy_path = legacy_memory_path()?;
    let conn = open_connection(&db_path)?;
    let _ = migrate_from_legacy_file(&conn, &legacy_path);
    op(&conn)
}

fn map_task_row(row: &Row<'_>) -> rusqlite::Result<PersistedTask> {
    let mcp_ids_json: String = row.get("mcp_ids_json")?;
    let metadata_json: String = row.get("metadata_json")?;
    let mcp_ids = parse_json_array(&mcp_ids_json);
    let status: String = row.get("status")?;
    let agent_id: Option<String> = row.get("agent_id")?;
    let title: String = row.get("title")?;
    Ok(PersistedTask {
        id: row.get("id")?,
        source: row.get("source")?,
        agent_id: agent_id.clone(),
        assignee: agent_id,
        label: title.clone(),
        title,
        instructions: row.get("instructions")?,
        eta_minutes: row.get("eta_minutes")?,
        mcp_ids: mcp_ids.clone(),
        metadata: parse_json_map(&metadata_json),
        status: normalize_status(&status, "in_progress"),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        received_at: row.get("received_at")?,
        completed_at: row.get("completed_at")?,
        log: Vec::new(),
        total_steps: 2 + mcp_ids.len() * 2 + 2,
    })
}

fn normalize_task(task: &PersistedTask, fallback_source: &str, fallback_status: &str) -> PersistedTask {
    let timestamp = now_iso();
    let source = if task.source.is_empty() { fallback_source.to_string() } else { task.source.clone() };
    let status = normalize_status(&task.status, fallback_status);
    let created_at = if task.created_at.is_empty() { timestamp.clone() } else { task.created_at.clone() };
    let updated_at = if task.updated_at.is_empty() { timestamp.clone() } else { task.updated_at.clone() };
    let received_at = if source == "hermes" {
        Some(task.received_at.clone().unwrap_or_else(|| timestamp.clone()))
    } else {
        task.received_at.clone()
    };
    PersistedTask {
        id: task.id.clone(),
        source,
        agent_id: task.agent_id.clone().or_else(|| task.assignee.clone()),
        assignee: task.agent_id.clone().or_else(|| task.assignee.clone()),
        label: if task.label.is_empty() { task.title.clone() } else { task.label.clone() },
        title: if task.title.is_empty() { task.label.clone() } else { task.title.clone() },
        instructions: task.instructions.clone(),
        eta_minutes: task.eta_minutes,
        mcp_ids: task.mcp_ids.clone(),
        metadata: task.metadata.clone(),
        status: status.clone(),
        created_at,
        updated_at,
        received_at,
        completed_at: if status == "done" {
            task.completed_at.clone().or_else(|| Some(timestamp))
        } else {
            task.completed_at.clone()
        },
        log: task.log.clone(),
        total_steps: if task.total_steps == 0 { 2 + task.mcp_ids.len() * 2 + 2 } else { task.total_steps },
    }
}

fn task_from_value(value: Value) -> PersistedTask {
    let object = value.as_object().cloned().unwrap_or_default();
    let title = object
        .get("title")
        .and_then(Value::as_str)
        .or_else(|| object.get("label").and_then(Value::as_str))
        .unwrap_or("Untitled Task")
        .to_string();
    let mcp_ids = object
        .get("mcpIds")
        .or_else(|| object.get("mcp_ids"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|entry| entry.as_str().map(str::to_string))
        .collect::<Vec<String>>();
    let metadata = object
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let total_steps = 2 + mcp_ids.len() * 2 + 2;
    let assignee = object
        .get("agentId")
        .and_then(Value::as_str)
        .or_else(|| object.get("agent_id").and_then(Value::as_str))
        .or_else(|| object.get("assignee").and_then(Value::as_str))
        .map(str::to_string);
    PersistedTask {
        id: object.get("id").and_then(Value::as_str).unwrap_or("").to_string(),
        source: object
            .get("source")
            .and_then(Value::as_str)
            .unwrap_or("manual")
            .to_string(),
        agent_id: assignee.clone(),
        assignee,
        label: object
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or(&title)
            .to_string(),
        title,
        instructions: object
            .get("instructions")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        eta_minutes: object
            .get("etaMinutes")
            .and_then(Value::as_i64)
            .or_else(|| object.get("eta_minutes").and_then(Value::as_i64))
            .or_else(|| object.get("eta").and_then(Value::as_i64)),
        mcp_ids,
        metadata,
        status: object
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("pending")
            .to_string(),
        created_at: object
            .get("createdAt")
            .and_then(Value::as_str)
            .or_else(|| object.get("created_at").and_then(Value::as_str))
            .unwrap_or("")
            .to_string(),
        updated_at: object
            .get("updatedAt")
            .and_then(Value::as_str)
            .or_else(|| object.get("updated_at").and_then(Value::as_str))
            .unwrap_or("")
            .to_string(),
        received_at: object
            .get("receivedAt")
            .and_then(Value::as_str)
            .or_else(|| object.get("received_at").and_then(Value::as_str))
            .map(str::to_string),
        completed_at: object
            .get("completedAt")
            .and_then(Value::as_str)
            .or_else(|| object.get("completed_at").and_then(Value::as_str))
            .map(str::to_string),
        log: Vec::new(),
        total_steps,
    }
}

fn upsert_task_record(conn: &Connection, task: &PersistedTask) -> Result<PersistedTask, String> {
    let normalized = normalize_task(
        task,
        if task.source.is_empty() { "manual" } else { &task.source },
        if task.source == "hermes" { "pending" } else { "in_progress" },
    );
    conn.execute(
        "
        INSERT INTO tasks (
          id, source, agent_id, title, instructions, eta_minutes,
          mcp_ids_json, metadata_json, status, created_at, updated_at, received_at, completed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
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
        ",
        params![
            normalized.id,
            normalized.source,
            normalized.agent_id,
            normalized.title,
            normalized.instructions,
            normalized.eta_minutes,
            to_json_string(&normalized.mcp_ids)?,
            to_json_string(&normalized.metadata)?,
            normalized.status,
            normalized.created_at,
            normalized.updated_at,
            normalized.received_at,
            normalized.completed_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    get_task(conn, &task.id)?.ok_or_else(|| "Task not found".to_string())
}

fn get_task(conn: &Connection, task_id: &str) -> Result<Option<PersistedTask>, String> {
    conn.query_row("SELECT * FROM tasks WHERE id = ?1", [task_id], map_task_row)
        .optional()
        .map_err(|e| e.to_string())
}

fn list_pending_hermes(conn: &Connection) -> Result<Vec<PersistedTask>, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT * FROM tasks
            WHERE source = 'hermes' AND status = 'pending'
            ORDER BY received_at ASC, created_at ASC
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_task_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn replace_pending_hermes(conn: &Connection, tasks: &[PersistedTask]) -> Result<Vec<PersistedTask>, String> {
    conn.execute("DELETE FROM tasks WHERE source = 'hermes' AND status = 'pending'", [])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE source = 'hermes' AND status = 'rejected'", [])
        .map_err(|e| e.to_string())?;
    for task in tasks {
        let next_task = PersistedTask { source: "hermes".to_string(), status: "pending".to_string(), ..task.clone() };
        upsert_task_record(conn, &next_task)?;
    }
    list_pending_hermes(conn)
}

fn get_memory_value_conn(conn: &Connection, key: &str) -> Result<Option<Value>, String> {
    if key == "hermes_tasks" {
        let tasks = list_pending_hermes(conn)?;
        if tasks.is_empty() {
            return Ok(None);
        }
        return serde_json::to_value(tasks).map(Some).map_err(|e| e.to_string());
    }
    let raw = conn
        .query_row(
            "SELECT value_json FROM memory_entries WHERE key = ?1",
            [key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(raw.map(|value| parse_json_value(&value)))
}

fn get_memory_store_conn(conn: &Connection) -> Result<HashMap<String, Value>, String> {
    let mut stmt = conn.prepare("SELECT key, value_json FROM memory_entries ORDER BY key").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    let mut store = HashMap::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let key: String = row.get(0).map_err(|e| e.to_string())?;
        let value_json: String = row.get(1).map_err(|e| e.to_string())?;
        store.insert(key, parse_json_value(&value_json));
    }
    let hermes_tasks = list_pending_hermes(conn)?;
    if !hermes_tasks.is_empty() {
        store.insert("hermes_tasks".to_string(), serde_json::to_value(hermes_tasks).map_err(|e| e.to_string())?);
    }
    Ok(store)
}

fn list_memory_keys_conn(conn: &Connection) -> Result<Vec<String>, String> {
    let mut stmt = conn.prepare("SELECT key FROM memory_entries ORDER BY key").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut keys = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    if !list_pending_hermes(conn)?.is_empty() {
        keys.push("hermes_tasks".to_string());
    }
    Ok(keys)
}

fn set_memory_value_conn(conn: &Connection, key: &str, value: Value) -> Result<(), String> {
    if key.is_empty() {
        return Err("Missing key".to_string());
    }
    if key.len() > 256 {
        return Err("Key length exceeds 256 characters".to_string());
    }
    let serialized = serde_json::to_string(&value).map_err(|e| e.to_string())?;
    if serialized.len() > 200 * 1024 {
        return Err("Value too large (max 200KB)".to_string());
    }
    if key == "hermes_tasks" {
        let raw_tasks = value.as_array().cloned().ok_or_else(|| "hermes_tasks must be an array".to_string())?;
        let tasks = raw_tasks.into_iter().map(task_from_value).collect::<Vec<PersistedTask>>();
        replace_pending_hermes(conn, &tasks)?;
        return Ok(());
    }
    conn.execute(
        "
        INSERT INTO memory_entries (key, value_json, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
        ",
        params![key, serialized, now_iso()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_memory_value_conn(conn: &Connection, key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("Missing key".to_string());
    }
    if key == "hermes_tasks" {
        conn.execute("DELETE FROM tasks WHERE source = 'hermes' AND status = 'pending'", [])
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    conn.execute("DELETE FROM memory_entries WHERE key = ?1", [key]).map_err(|e| e.to_string())?;
    Ok(())
}

fn clear_memory_conn(conn: &Connection) -> Result<(), String> {
    conn.execute("DELETE FROM memory_entries", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tasks WHERE source = 'hermes' AND status = 'pending'", [])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn transition_task_conn(conn: &Connection, req: &TaskTransitionRequest) -> Result<PersistedTask, String> {
    let existing = get_task(conn, &req.task_id)?.ok_or_else(|| "Task not found".to_string())?;
    let next = PersistedTask {
        status: req.status.clone(),
        agent_id: req.agent_id.clone().or(existing.agent_id.clone()),
        assignee: req.agent_id.clone().or(existing.agent_id.clone()),
        completed_at: req.completed_at.clone().or(existing.completed_at.clone()),
        updated_at: now_iso(),
        ..existing
    };
    upsert_task_record(conn, &next)
}

fn delete_task_conn(conn: &Connection, task_id: &str) -> Result<usize, String> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", [task_id])
        .map(|changes| changes as usize)
        .map_err(|e| e.to_string())
}

fn get_migration_info_conn(conn: &Connection) -> Result<Option<MigrationInfo>, String> {
    conn.query_row(
        "SELECT * FROM migration_records WHERE migration_key = ?1",
        [MIGRATION_KEY],
        |row| {
            let details_json: String = row.get("details_json")?;
            Ok(MigrationInfo {
                migration_key: row.get("migration_key")?,
                source_path: row.get("source_path")?,
                source_hash: row.get("source_hash")?,
                status: row.get("status")?,
                started_at: row.get("started_at")?,
                completed_at: row.get("completed_at")?,
                details: parse_json_map(&details_json),
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn record_migration(conn: &Connection, source_path: &Path, status: &str, started_at: &str, completed_at: Option<&str>, details: &Map<String, Value>) -> Result<(), String> {
    conn.execute(
        "
        INSERT INTO migration_records (
          migration_key, source_path, source_hash, status, started_at, completed_at, details_json
        ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6)
        ON CONFLICT(migration_key) DO UPDATE SET
          source_path = excluded.source_path,
          source_hash = excluded.source_hash,
          status = excluded.status,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          details_json = excluded.details_json
        ",
        params![
            MIGRATION_KEY,
            source_path.to_string_lossy().to_string(),
            status,
            started_at,
            completed_at,
            to_json_string(details)?,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn migrate_from_legacy_file(conn: &Connection, legacy_path: &Path) -> Result<(), String> {
    if let Some(existing) = get_migration_info_conn(conn)? {
        if existing.status == "completed" {
            return Ok(());
        }
    }
    if !legacy_path.exists() {
        return Ok(());
    }
    let raw = fs::read_to_string(legacy_path).map_err(|e| e.to_string())?;
    let started_at = now_iso();
    let mut pending_details = Map::new();
    pending_details.insert("importedKeys".to_string(), Value::from(0));
    pending_details.insert("importedHermesTasks".to_string(), Value::from(0));
    record_migration(conn, legacy_path, "pending", &started_at, None, &pending_details)?;

    let parsed: Value = match serde_json::from_str(&raw) {
        Ok(value) => value,
        Err(error) => {
            let mut details = Map::new();
            details.insert("error".to_string(), Value::from(error.to_string()));
            record_migration(conn, legacy_path, "failed", &started_at, Some(&now_iso()), &details)?;
            return Err(error.to_string());
        }
    };

    let object = parsed.as_object().cloned().unwrap_or_default();
    let mut imported_keys = 0;
    let mut imported_hermes_tasks = 0;
    for (key, value) in object {
        if key == "hermes_tasks" {
            let raw_tasks = value.as_array().cloned().unwrap_or_default();
            let tasks = raw_tasks.into_iter().map(task_from_value).collect::<Vec<PersistedTask>>();
            imported_hermes_tasks = tasks.len();
            replace_pending_hermes(conn, &tasks)?;
            continue;
        }
        set_memory_value_conn(conn, &key, value)?;
        imported_keys += 1;
    }

    let mut details = Map::new();
    details.insert("importedKeys".to_string(), Value::from(imported_keys as i64));
    details.insert("importedHermesTasks".to_string(), Value::from(imported_hermes_tasks as i64));
    record_migration(conn, legacy_path, "completed", &started_at, Some(&now_iso()), &details)?;
    Ok(())
}

fn bootstrap_conn(conn: &Connection, agent_ids: &[String]) -> Result<BootstrapResponse, String> {
    let mut grouped: HashMap<String, AgentBootstrap> = agent_ids
        .iter()
        .cloned()
        .map(|agent_id| {
            (
                agent_id.clone(),
                AgentBootstrap { agent_id, tasks: Vec::new(), history: Vec::new() },
            )
        })
        .collect();

    let mut stmt = conn
        .prepare("SELECT * FROM tasks WHERE status IN ('pending', 'in_progress', 'done', 'verifying') ORDER BY created_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_task_row).map_err(|e| e.to_string())?;
    for row in rows {
        let task = row.map_err(|e| e.to_string())?;
        if task.source == "hermes" && task.status == "pending" {
            continue;
        }
        let Some(agent_id) = task.agent_id.clone() else { continue; };
        let entry = grouped.entry(agent_id.clone()).or_insert(AgentBootstrap {
            agent_id,
            tasks: Vec::new(),
            history: Vec::new(),
        });
        if task.status == "done" {
            entry.history.insert(0, task);
        } else {
            entry.tasks.push(task);
        }
    }

    let mut agents = Vec::with_capacity(grouped.len());
    for agent_id in agent_ids {
        if let Some(agent) = grouped.remove(agent_id) {
            agents.push(agent);
        }
    }

    let mut discovered_agents: Vec<_> = grouped.into_iter().collect();
    discovered_agents.sort_by(|(left_id, _), (right_id, _)| left_id.cmp(right_id));
    agents.extend(discovered_agents.into_iter().map(|(_, agent)| agent));

    Ok(BootstrapResponse {
        agents,
        hermes_tasks: list_pending_hermes(conn)?,
        migration: get_migration_info_conn(conn)?,
    })
}

#[tauri::command]
pub fn persistence_bootstrap(app: AppHandle, agent_ids: Option<Vec<String>>) -> Result<BootstrapResponse, String> {
    with_connection(&app, |conn| bootstrap_conn(conn, &agent_ids.unwrap_or_default()))
}

#[tauri::command]
pub fn persistence_task_upsert(app: AppHandle, task: PersistedTask) -> Result<TaskResponse, String> {
    with_connection(&app, |conn| {
        let task = upsert_task_record(conn, &task)?;
        Ok(TaskResponse { ok: true, task })
    })
}

#[tauri::command]
pub fn persistence_task_transition(app: AppHandle, task_id: String, status: String, agent_id: Option<String>, completed_at: Option<String>) -> Result<TaskResponse, String> {
    with_connection(&app, |conn| {
        let task = transition_task_conn(conn, &TaskTransitionRequest { task_id, status, agent_id, completed_at })?;
        Ok(TaskResponse { ok: true, task })
    })
}

#[tauri::command]
pub fn persistence_task_delete(app: AppHandle, task_id: String) -> Result<RemoveResponse, String> {
    with_connection(&app, |conn| Ok(RemoveResponse { ok: true, removed: delete_task_conn(conn, &task_id)? }))
}

#[tauri::command]
pub fn memory_get(app: AppHandle, key: Option<String>) -> Result<MemoryResponse, String> {
    with_connection(&app, |conn| {
        if let Some(key) = key {
            Ok(MemoryResponse { value: get_memory_value_conn(conn, &key)?, store: None })
        } else {
            Ok(MemoryResponse { value: None, store: Some(get_memory_store_conn(conn)?) })
        }
    })
}

#[tauri::command]
pub fn memory_set(app: AppHandle, key: String, value: Value) -> Result<OkResponse, String> {
    with_connection(&app, |conn| {
        set_memory_value_conn(conn, &key, value)?;
        Ok(OkResponse { ok: true })
    })
}

#[tauri::command]
pub fn memory_keys(app: AppHandle) -> Result<MemoryKeysResponse, String> {
    with_connection(&app, |conn| Ok(MemoryKeysResponse { keys: list_memory_keys_conn(conn)? }))
}

#[tauri::command]
pub fn memory_delete(app: AppHandle, key: String) -> Result<OkResponse, String> {
    with_connection(&app, |conn| {
        delete_memory_value_conn(conn, &key)?;
        Ok(OkResponse { ok: true })
    })
}

#[tauri::command]
pub fn memory_clear(app: AppHandle) -> Result<OkResponse, String> {
    with_connection(&app, |conn| {
        clear_memory_conn(conn)?;
        Ok(OkResponse { ok: true })
    })
}

#[tauri::command]
pub fn hermes_assign(app: AppHandle, payload: Value) -> Result<TaskResponse, String> {
    with_connection(&app, |conn| {
        let task_value = payload.get("task").cloned().unwrap_or(Value::Null);
        let now = now_iso();
        let assignee = payload
            .get("targetAgent")
            .and_then(Value::as_str)
            .or_else(|| payload.get("assignee").and_then(Value::as_str))
            .or_else(|| task_value.get("assignee").and_then(Value::as_str))
            .map(str::to_string);
        let title = payload
            .get("title")
            .and_then(Value::as_str)
            .or_else(|| task_value.get("title").and_then(Value::as_str))
            .or_else(|| payload.get("summary").and_then(Value::as_str))
            .unwrap_or("Hermes Task")
            .to_string();
        let task = PersistedTask {
            id: payload
                .get("taskId")
                .and_then(Value::as_str)
                .or_else(|| payload.get("id").and_then(Value::as_str))
                .or_else(|| task_value.get("id").and_then(Value::as_str))
                .unwrap_or("t_tauri")
                .to_string(),
            source: "hermes".to_string(),
            agent_id: assignee.clone(),
            assignee,
            label: title.clone(),
            title,
            instructions: payload
                .get("instructions")
                .and_then(Value::as_str)
                .or_else(|| task_value.get("instructions").and_then(Value::as_str))
                .or_else(|| payload.get("description").and_then(Value::as_str))
                .unwrap_or("")
                .to_string(),
            eta_minutes: payload
                .get("etaMinutes")
                .and_then(Value::as_i64)
                .or_else(|| task_value.get("eta").and_then(Value::as_i64))
                .or_else(|| payload.get("eta").and_then(Value::as_i64)),
            mcp_ids: Vec::new(),
            metadata: payload
                .get("metadata")
                .and_then(Value::as_object)
                .cloned()
                .or_else(|| payload.get("meta").and_then(Value::as_object).cloned())
                .unwrap_or_default(),
            status: "pending".to_string(),
            created_at: now.clone(),
            updated_at: now.clone(),
            received_at: Some(now),
            completed_at: None,
            log: Vec::new(),
            total_steps: 4,
        };
        let task = upsert_task_record(conn, &task)?;
        Ok(TaskResponse { ok: true, task })
    })
}

#[tauri::command]
pub fn hermes_delete(app: AppHandle, task_id: String) -> Result<RemoveResponse, String> {
    with_connection(&app, |conn| {
        if list_pending_hermes(conn)?.is_empty() {
            return Err("No hermes_tasks".to_string());
        }
        let removed = conn
            .execute("DELETE FROM tasks WHERE id = ?1 AND source = 'hermes' AND status = 'pending'", [task_id])
            .map(|changes| changes as usize)
            .map_err(|e| e.to_string())?;
        Ok(RemoveResponse { ok: true, removed })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_test_path(name: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("agent-bar-hangout-{name}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn memory_and_tasks_round_trip() {
        let root = unique_test_path("roundtrip");
        let conn = open_connection(&root.join(DB_FILE)).unwrap();
        set_memory_value_conn(&conn, "alpha", Value::from(1)).unwrap();
        assert_eq!(get_memory_value_conn(&conn, "alpha").unwrap().unwrap(), Value::from(1));

        let task = PersistedTask {
            id: "task-1".to_string(),
            source: "manual".to_string(),
            agent_id: Some("nova".to_string()),
            assignee: Some("nova".to_string()),
            label: "Task 1".to_string(),
            title: "Task 1".to_string(),
            instructions: "Do the thing".to_string(),
            eta_minutes: Some(5),
            mcp_ids: vec!["filesystem".to_string()],
            metadata: Map::new(),
            status: "in-progress".to_string(),
            created_at: now_iso(),
            updated_at: now_iso(),
            received_at: None,
            completed_at: None,
            log: Vec::new(),
            total_steps: 6,
        };
        upsert_task_record(&conn, &task).unwrap();
        let bootstrap = bootstrap_conn(&conn, &["nova".to_string()]).unwrap();
        assert_eq!(bootstrap.agents.len(), 1);
        assert_eq!(bootstrap.agents[0].tasks.len(), 1);
        assert_eq!(bootstrap.agents[0].tasks[0].status, "in_progress");
    }

    #[test]
    fn migration_imports_legacy_memory() {
        let root = unique_test_path("migration");
        fs::write(
            root.join(LEGACY_MEMORY_FILE),
            r#"{"alpha":{"count":2},"hermes_tasks":[{"id":"h1","title":"Hermes","instructions":"Do it","status":"pending"}]}"#,
        )
        .unwrap();
        let conn = open_connection(&root.join(DB_FILE)).unwrap();
        migrate_from_legacy_file(&conn, &root.join(LEGACY_MEMORY_FILE)).unwrap();
        assert_eq!(get_memory_value_conn(&conn, "alpha").unwrap().unwrap()["count"], Value::from(2));
        let hermes = list_pending_hermes(&conn).unwrap();
        assert_eq!(hermes.len(), 1);
        assert_eq!(hermes[0].id, "h1");
        assert_eq!(get_migration_info_conn(&conn).unwrap().unwrap().status, "completed");
    }
}
