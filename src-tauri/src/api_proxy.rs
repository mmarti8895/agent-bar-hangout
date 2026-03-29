use crate::vault;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

// ───── Slack API proxy ─────

#[derive(Deserialize)]
pub struct SlackRequest {
    pub action: Option<String>,
    pub channel: Option<String>,
    pub text: Option<String>,
    pub query: Option<String>,
}

#[tauri::command]
pub async fn slack_proxy(request: SlackRequest) -> Result<Value, String> {
    let creds = vault::get_adapter_creds("slack");
    let bot_token = creds.get("botToken").cloned().unwrap_or_default();
    if bot_token.is_empty() {
        return Err("Slack bot token not configured".to_string());
    }

    let client = Client::new();
    let action = request.action.as_deref().unwrap_or("list_channels");

    let (url, body): (String, Option<Value>) = match action {
        "list_channels" => (
            "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100".to_string(),
            None,
        ),
        "send_message" => (
            "https://slack.com/api/chat.postMessage".to_string(),
            Some(json!({
                "channel": request.channel.as_deref().unwrap_or("#general"),
                "text": request.text.as_deref().unwrap_or("")
            })),
        ),
        "read_channel" => {
            let ch = request.channel.as_deref().unwrap_or("");
            (
                format!("https://slack.com/api/conversations.history?channel={}&limit=20", urlencoding::encode(ch)),
                None,
            )
        }
        "search_messages" => {
            let q = request.query.as_deref().unwrap_or("");
            (
                format!("https://slack.com/api/search.messages?query={}&count=10", urlencoding::encode(q)),
                None,
            )
        }
        _ => (
            "https://slack.com/api/conversations.list?limit=10".to_string(),
            None,
        ),
    };

    let mut req = client.request(
        if body.is_some() { reqwest::Method::POST } else { reqwest::Method::GET },
        &url,
    )
    .header("Authorization", format!("Bearer {bot_token}"))
    .header("Content-Type", "application/json");

    if let Some(b) = &body {
        req = req.json(b);
    }

    let resp = req.send().await.map_err(|e| format!("Slack API error: {e}"))?;
    let data: Value = resp.json().await.map_err(|e| format!("Slack parse error: {e}"))?;
    Ok(data)
}

// ───── Stripe API proxy ─────

#[derive(Deserialize)]
pub struct StripeRequest {
    pub action: Option<String>,
    pub limit: Option<u32>,
}

#[tauri::command]
pub async fn stripe_proxy(request: StripeRequest) -> Result<Value, String> {
    let creds = vault::get_adapter_creds("stripe");
    let secret_key = creds.get("secretKey").cloned().unwrap_or_default();
    if secret_key.is_empty() {
        return Err("Stripe secret key not configured".to_string());
    }

    let client = Client::new();
    let action = request.action.as_deref().unwrap_or("list_payments");
    let limit = request.limit.unwrap_or(10);

    let url = match action {
        "list_payments" => format!("https://api.stripe.com/v1/charges?limit={limit}"),
        "list_subscriptions" => format!("https://api.stripe.com/v1/subscriptions?limit={limit}"),
        "get_balance" => "https://api.stripe.com/v1/balance".to_string(),
        "list_customers" => format!("https://api.stripe.com/v1/customers?limit={limit}"),
        _ => format!("https://api.stripe.com/v1/charges?limit=5"),
    };

    let resp = client
        .get(&url)
        .header("Authorization", format!("Bearer {secret_key}"))
        .send()
        .await
        .map_err(|e| format!("Stripe API error: {e}"))?;

    let data: Value = resp.json().await.map_err(|e| format!("Stripe parse error: {e}"))?;
    Ok(data)
}

// ───── Email (SendGrid) API proxy ─────

#[derive(Deserialize)]
pub struct EmailRequest {
    pub action: Option<String>,
    pub to: Option<String>,
    pub from: Option<String>,
    pub subject: Option<String>,
    pub html: Option<String>,
    pub text: Option<String>,
}

#[tauri::command]
pub async fn email_proxy(request: EmailRequest) -> Result<Value, String> {
    let creds = vault::get_adapter_creds("email");
    let api_key = creds.get("apiKey").cloned().unwrap_or_default();
    if api_key.is_empty() {
        return Err("SendGrid API key not configured".to_string());
    }

    let client = Client::new();
    let action = request.action.as_deref().unwrap_or("get_stats");

    match action {
        "send_email" => {
            let to = request.to.as_deref().unwrap_or("");
            let from = request.from.as_deref().unwrap_or("noreply@app.com");
            let subject = request.subject.as_deref().unwrap_or("No Subject");
            let content = request.text.as_deref()
                .or(request.html.as_deref())
                .unwrap_or("");

            let body = json!({
                "personalizations": [{"to": [{"email": to}]}],
                "from": {"email": from},
                "subject": subject,
                "content": [{"type": "text/plain", "value": content}]
            });

            let resp = client
                .post("https://api.sendgrid.com/v3/mail/send")
                .header("Authorization", format!("Bearer {api_key}"))
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Email API error: {e}"))?;

            let status = resp.status().as_u16();
            Ok(json!({"ok": resp.status().is_success(), "status": status}))
        }
        "get_stats" => {
            let resp = client
                .get("https://api.sendgrid.com/v3/stats?start_date=2026-03-01")
                .header("Authorization", format!("Bearer {api_key}"))
                .send()
                .await
                .map_err(|e| format!("Email API error: {e}"))?;

            let data: Value = resp.json().await.map_err(|e| format!("Email parse error: {e}"))?;
            Ok(data)
        }
        _ => Err(format!("Unknown email action: {action}")),
    }
}

// ───── OpenClaw Gateway proxy ─────

#[derive(Deserialize)]
pub struct OpenClawRequest {
    pub session_id: Option<String>,
    pub message: Option<String>,
}

fn is_local_url(url_str: &str) -> bool {
    if let Ok(url) = reqwest::Url::parse(url_str) {
        let host = url.host_str().unwrap_or("").to_lowercase();
        host == "localhost" || host == "127.0.0.1" || host == "::1"
            || host == "0.0.0.0" || host.ends_with(".local")
    } else {
        false
    }
}

#[tauri::command]
pub async fn openclaw_proxy(request: OpenClawRequest) -> Result<Value, String> {
    let creds = vault::get_adapter_creds("openclaw");
    let gateway_url = creds.get("gatewayUrl").cloned().unwrap_or_default();
    if gateway_url.is_empty() {
        return Err("OpenClaw gateway URL not configured".to_string());
    }

    // Convert ws:// to http:// for REST endpoint
    let http_url = gateway_url
        .replace("ws://", "http://")
        .replace("wss://", "https://");

    if !is_local_url(&http_url) {
        return Err("OpenClaw gateway must be a local address".to_string());
    }

    let url = format!("{}/api/message", http_url.trim_end_matches('/'));
    let auth_token = creds.get("authToken").cloned().unwrap_or_default();

    let client = Client::new();
    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json");

    if !auth_token.is_empty() {
        req = req.header("Authorization", format!("Bearer {auth_token}"));
    }

    let body = json!({
        "session": request.session_id.as_deref().unwrap_or("main"),
        "message": request.message.as_deref().unwrap_or("")
    });

    let resp = req.json(&body).send().await.map_err(|e| format!("OpenClaw error: {e}"))?;
    let data: Value = resp.json().await.map_err(|e| format!("OpenClaw parse error: {e}"))?;
    Ok(data)
}
