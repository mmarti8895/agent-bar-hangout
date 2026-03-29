use crate::vault;
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

// ───── Per-agent conversation context ─────
const CTX_TTL_SECS: i64 = 180; // 3 minutes
const CTX_MAX_PAIRS: usize = 5; // 5 user+assistant pairs = 10 messages

#[derive(Clone)]
struct ContextEntry {
    role: String,
    content: String,
    expires_at: i64, // unix timestamp
}

static AGENT_CONTEXTS: once_cell::sync::Lazy<Mutex<HashMap<String, Vec<ContextEntry>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

fn prune_and_get(agent_id: &str) -> Vec<ContextEntry> {
    let mut map = AGENT_CONTEXTS.lock().unwrap();
    let now = Utc::now().timestamp();
    let entries = map.entry(agent_id.to_string()).or_default();
    entries.retain(|e| e.expires_at > now);
    entries.clone()
}

fn push_context(agent_id: &str, role: &str, content: &str) {
    let mut map = AGENT_CONTEXTS.lock().unwrap();
    let entries = map.entry(agent_id.to_string()).or_default();
    let now = Utc::now().timestamp();
    entries.retain(|e| e.expires_at > now);
    entries.push(ContextEntry {
        role: role.to_string(),
        content: content.to_string(),
        expires_at: now + CTX_TTL_SECS,
    });
    while entries.len() > CTX_MAX_PAIRS * 2 {
        entries.remove(0);
    }
}

#[derive(Deserialize)]
pub struct ChatRequest {
    pub prompt: String,
    pub agent_id: Option<String>,
    pub vendor: Option<String>,
    pub vendor_config: Option<HashMap<String, String>>,
}

#[derive(Serialize)]
pub struct ChatResponse {
    pub answer: String,
    pub vendor: String,
    pub context_entries: usize,
}

fn build_messages(system: &str, ctx: &[ContextEntry], prompt: &str) -> Vec<Value> {
    let mut msgs = vec![json!({"role": "system", "content": system})];
    for e in ctx {
        msgs.push(json!({"role": e.role, "content": e.content}));
    }
    msgs.push(json!({"role": "user", "content": prompt}));
    msgs
}

fn system_prompt() -> String {
    let today = Utc::now().format("%A, %B %-d, %Y").to_string();
    format!("You are a helpful assistant. Today is {today}. Provide concise, factual answers. For weather, include current conditions, temperature, humidity, wind, and forecast when possible. For searches, provide relevant factual information with sources when applicable. If the user refers to something from a previous answer, use the conversation history to respond accurately.")
}

#[tauri::command]
pub async fn chat_proxy(request: ChatRequest) -> Result<ChatResponse, String> {
    let agent_id = request.agent_id.as_deref().unwrap_or("");
    let vendor = request.vendor.as_deref().unwrap_or("openai");
    let vc = request.vendor_config.unwrap_or_default();

    // Merge vault credentials with any explicitly passed credentials
    let vault_creds = vault::get_adapter_creds("web");
    let mut merged = vault_creds;
    for (k, v) in &vc {
        if !v.is_empty() {
            merged.insert(k.clone(), v.clone());
        }
    }

    let sys = system_prompt();
    let ctx = prune_and_get(agent_id);
    let client = Client::new();

    let answer = match vendor {
        "openai" => call_openai(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "anthropic" => call_anthropic(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "google" => call_gemini(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "xai" => call_xai(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "deepseek" => call_deepseek(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "ollama" => call_ollama(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "mistral" => call_mistral(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "cohere" => call_cohere(&client, &sys, &ctx, &request.prompt, &merged).await?,
        "perplexity" => call_perplexity(&client, &sys, &ctx, &request.prompt, &merged).await?,
        _ => return Err(format!("Unknown LLM vendor: {vendor}")),
    };

    if !agent_id.is_empty() {
        push_context(agent_id, "user", &request.prompt);
        push_context(agent_id, "assistant", &answer);
    }

    let ctx_count = prune_and_get(agent_id).len();
    Ok(ChatResponse {
        answer,
        vendor: vendor.to_string(),
        context_entries: ctx_count,
    })
}

#[tauri::command]
pub async fn context_clear(agent_id: Option<String>) -> Result<String, String> {
    let mut map = AGENT_CONTEXTS.lock().unwrap();
    if let Some(id) = agent_id {
        map.remove(&id);
        Ok(id)
    } else {
        map.clear();
        Ok("all".to_string())
    }
}

// ───── OpenAI ─────
async fn call_openai(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("OpenAI API key not configured".to_string());
    }
    let messages = build_messages(sys, ctx, prompt);
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("gpt-4o-mini");
    let mut req = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Content-Type", "application/json");
    if let Some(org) = vc.get("orgId").filter(|o| !o.is_empty()) {
        req = req.header("OpenAI-Organization", org.as_str());
    }
    let body = json!({"model": model, "messages": messages, "max_tokens": 1024, "temperature": 0.7});
    let resp = req.json(&body).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("OpenAI HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No response from OpenAI.")
        .to_string())
}

// ───── Anthropic ─────
async fn call_anthropic(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("Anthropic API key not configured".to_string());
    }
    let mut messages: Vec<Value> = ctx.iter().map(|e| json!({"role": &e.role, "content": &e.content})).collect();
    messages.push(json!({"role": "user", "content": prompt}));
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("claude-sonnet-4-20250514");
    let body = json!({"model": model, "max_tokens": 1024, "system": sys, "messages": messages});
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let blocks = data["content"].as_array().cloned().unwrap_or_default();
    let answer: String = blocks.iter().filter_map(|b| b["text"].as_str()).collect::<Vec<_>>().join("\n");
    Ok(if answer.is_empty() { "No response from Claude.".to_string() } else { answer })
}

// ───── Google Gemini ─────
async fn call_gemini(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("Google AI API key not configured".to_string());
    }
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("gemini-2.0-flash");
    let mut contents: Vec<Value> = ctx.iter().map(|e| {
        let role = if e.role == "assistant" { "model" } else { "user" };
        json!({"role": role, "parts": [{"text": &e.content}]})
    }).collect();
    contents.push(json!({"role": "user", "parts": [{"text": prompt}]}));
    let url = format!("https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}", model, api_key);
    let body = json!({
        "systemInstruction": {"parts": [{"text": sys}]},
        "contents": contents,
        "generationConfig": {"maxOutputTokens": 1024, "temperature": 0.7}
    });
    let resp = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Gemini HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    let parts = data["candidates"][0]["content"]["parts"].as_array().cloned().unwrap_or_default();
    let answer: String = parts.iter().filter_map(|p| p["text"].as_str()).collect::<Vec<_>>().join("\n");
    Ok(if answer.is_empty() { "No response from Gemini.".to_string() } else { answer })
}

// ───── xAI / Grok (OpenAI-compatible) ─────
async fn call_xai(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("xAI API key not configured".to_string());
    }
    let messages = build_messages(sys, ctx, prompt);
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("grok-3");
    let body = json!({"model": model, "messages": messages, "max_tokens": 1024, "temperature": 0.7});
    let resp = client
        .post("https://api.x.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("xAI HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["choices"][0]["message"]["content"].as_str().unwrap_or("No response from Grok.").to_string())
}

// ───── DeepSeek (OpenAI-compatible) ─────
async fn call_deepseek(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("DeepSeek API key not configured".to_string());
    }
    let messages = build_messages(sys, ctx, prompt);
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("deepseek-chat");
    let body = json!({"model": model, "messages": messages, "max_tokens": 1024, "temperature": 0.7});
    let resp = client
        .post("https://api.deepseek.com/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("DeepSeek HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["choices"][0]["message"]["content"].as_str().unwrap_or("No response from DeepSeek.").to_string())
}

// ───── Ollama (local, SSRF-protected) ─────
fn is_local_url(url_str: &str) -> bool {
    if let Ok(url) = reqwest::Url::parse(url_str) {
        let host = url.host_str().unwrap_or("").to_lowercase();
        host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "0.0.0.0" || host.ends_with(".local")
    } else {
        false
    }
}

async fn call_ollama(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let endpoint = vc.get("endpoint").cloned().unwrap_or_else(|| "http://localhost:11434".to_string());
    let endpoint = endpoint.trim_end_matches('/');
    if !is_local_url(endpoint) {
        return Err("Ollama endpoint must be a local address (localhost/127.0.0.1)".to_string());
    }
    let model = vc.get("model").cloned().unwrap_or_default();
    if model.is_empty() {
        return Err("Ollama model not specified".to_string());
    }
    let messages = build_messages(sys, ctx, prompt);
    let url = format!("{endpoint}/api/chat");
    let body = json!({"model": model, "messages": messages, "stream": false});
    let resp = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["message"]["content"].as_str().unwrap_or("No response from Ollama.").to_string())
}

// ───── Mistral (OpenAI-compatible) ─────
async fn call_mistral(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("Mistral API key not configured".to_string());
    }
    let messages = build_messages(sys, ctx, prompt);
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("mistral-large-latest");
    let body = json!({"model": model, "messages": messages, "max_tokens": 1024, "temperature": 0.7});
    let resp = client
        .post("https://api.mistral.ai/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Mistral HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["choices"][0]["message"]["content"].as_str().unwrap_or("No response from Mistral.").to_string())
}

// ───── Cohere ─────
async fn call_cohere(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("Cohere API key not configured".to_string());
    }
    let mut messages: Vec<Value> = vec![json!({"role": "system", "content": sys})];
    for e in ctx {
        messages.push(json!({"role": &e.role, "content": &e.content}));
    }
    messages.push(json!({"role": "user", "content": prompt}));
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("command-r-plus");
    let body = json!({"model": model, "messages": messages});
    let resp = client
        .post("https://api.cohere.com/v2/chat")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Cohere HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["message"]["content"][0]["text"].as_str().unwrap_or("No response from Cohere.").to_string())
}

// ───── Perplexity (OpenAI-compatible) ─────
async fn call_perplexity(
    client: &Client, sys: &str, ctx: &[ContextEntry], prompt: &str,
    vc: &HashMap<String, String>,
) -> Result<String, String> {
    let api_key = vc.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("Perplexity API key not configured".to_string());
    }
    let messages = build_messages(sys, ctx, prompt);
    let model = vc.get("model").filter(|m| !m.is_empty()).map(|m| m.as_str()).unwrap_or("sonar-pro");
    let body = json!({"model": model, "messages": messages, "max_tokens": 1024, "temperature": 0.7});
    let resp = client
        .post("https://api.perplexity.ai/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Perplexity HTTP {status}: {text}"));
    }
    let data: Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data["choices"][0]["message"]["content"].as_str().unwrap_or("No response from Perplexity.").to_string())
}
