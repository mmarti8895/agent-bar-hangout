use serde::{Deserialize, Serialize};
use tokio::process::Command as TokioCommand;

const MAX_OUTPUT_BYTES: usize = 10240;

#[derive(Deserialize)]
pub struct TerminalRequest {
    pub command: String,
    pub shell: Option<String>,
}

#[derive(Serialize)]
pub struct TerminalResponse {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[tauri::command]
pub async fn terminal_exec(request: TerminalRequest) -> Result<TerminalResponse, String> {
    if request.command.len() > 1000 {
        return Err("Command too long (max 1000 characters)".to_string());
    }

    let shell = request.shell.as_deref().unwrap_or("powershell");

    let child = match shell {
        "cmd" => TokioCommand::new("cmd")
            .args(["/C", &request.command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn(),
        "bash" | "sh" => TokioCommand::new(shell)
            .args(["-c", &request.command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn(),
        _ => TokioCommand::new("powershell")
            .args(["-NoProfile", "-Command", &request.command])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn(),
    };

    let child = child.map_err(|e| format!("Failed to spawn process: {e}"))?;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        child.wait_with_output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let mut stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let mut stderr = String::from_utf8_lossy(&output.stderr).to_string();
            stdout.truncate(MAX_OUTPUT_BYTES);
            stderr.truncate(MAX_OUTPUT_BYTES);
            Ok(TerminalResponse {
                stdout,
                stderr,
                exit_code: output.status.code().unwrap_or(-1),
            })
        }
        Ok(Err(e)) => Err(format!("Process error: {e}")),
        Err(_) => Err("Command timed out after 30 seconds".to_string()),
    }
}
