use keyring::Entry;
use serde_json;
use std::collections::HashMap;
use std::sync::Mutex;

const SERVICE_NAME: &str = "agent-bar-hangout";

/// Thread-safe cache of adapter credentials in memory (populated from OS keyring on demand).
static CREDENTIAL_CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, HashMap<String, String>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

fn entry_for(adapter_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, adapter_id).map_err(|e| format!("Keyring error: {e}"))
}

/// Store adapter credentials in the OS credential vault.
#[tauri::command]
pub fn vault_store(adapter_id: String, credentials: HashMap<String, String>) -> Result<(), String> {
    let json = serde_json::to_string(&credentials).map_err(|e| e.to_string())?;
    let entry = entry_for(&adapter_id)?;
    entry
        .set_password(&json)
        .map_err(|e| format!("Failed to store credentials: {e}"))?;
    // Update in-memory cache
    if let Ok(mut cache) = CREDENTIAL_CACHE.lock() {
        cache.insert(adapter_id, credentials);
    }
    Ok(())
}

/// Retrieve adapter credentials from the OS credential vault.
#[tauri::command]
pub fn vault_get(adapter_id: String) -> Result<HashMap<String, String>, String> {
    // Check cache first
    if let Ok(cache) = CREDENTIAL_CACHE.lock() {
        if let Some(creds) = cache.get(&adapter_id) {
            return Ok(creds.clone());
        }
    }
    let entry = entry_for(&adapter_id)?;
    match entry.get_password() {
        Ok(json) => {
            let creds: HashMap<String, String> =
                serde_json::from_str(&json).map_err(|e| e.to_string())?;
            // Populate cache
            if let Ok(mut cache) = CREDENTIAL_CACHE.lock() {
                cache.insert(adapter_id, creds.clone());
            }
            Ok(creds)
        }
        Err(keyring::Error::NoEntry) => Ok(HashMap::new()),
        Err(e) => Err(format!("Failed to retrieve credentials: {e}")),
    }
}

/// Delete adapter credentials from the OS credential vault.
#[tauri::command]
pub fn vault_delete(adapter_id: String) -> Result<(), String> {
    let entry = entry_for(&adapter_id)?;
    match entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {} // already gone
        Err(e) => return Err(format!("Failed to delete credentials: {e}")),
    }
    if let Ok(mut cache) = CREDENTIAL_CACHE.lock() {
        cache.remove(&adapter_id);
    }
    Ok(())
}

/// Check if an adapter has stored credentials.
#[tauri::command]
pub fn vault_has(adapter_id: String) -> Result<bool, String> {
    if let Ok(cache) = CREDENTIAL_CACHE.lock() {
        if cache.contains_key(&adapter_id) {
            return Ok(true);
        }
    }
    let entry = entry_for(&adapter_id)?;
    match entry.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(format!("Keyring check error: {e}")),
    }
}

/// Internal helper: get credentials for an adapter (used by proxy commands).
pub fn get_adapter_creds(adapter_id: &str) -> HashMap<String, String> {
    vault_get(adapter_id.to_string()).unwrap_or_default()
}
