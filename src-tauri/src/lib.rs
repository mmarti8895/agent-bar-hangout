mod api_proxy;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
