mod api_proxy;
mod persistence;
mod proxy;
mod terminal;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Credential vault
            vault::vault_store,
            vault::vault_get,
            vault::vault_delete,
            vault::vault_has,
            // LLM chat proxy + context
            proxy::chat_proxy,
            proxy::context_clear,
            // Terminal
            terminal::terminal_exec,
            // Service proxies
            api_proxy::slack_proxy,
            api_proxy::stripe_proxy,
            api_proxy::email_proxy,
            api_proxy::openclaw_proxy,
            // Durable persistence
            persistence::persistence_bootstrap,
            persistence::persistence_task_upsert,
            persistence::persistence_task_transition,
            persistence::persistence_task_delete,
            persistence::memory_get,
            persistence::memory_set,
            persistence::memory_keys,
            persistence::memory_delete,
            persistence::memory_clear,
            persistence::hermes_assign,
            persistence::hermes_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
