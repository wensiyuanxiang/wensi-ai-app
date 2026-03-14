use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelConfig {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub api_key: String,
    #[serde(default)]
    pub base_url: Option<String>,
    pub model_name: String,
}

fn chat_completion_url(base_url: Option<&str>) -> String {
    let u = match base_url {
        Some(s) => s.trim_end_matches('/'),
        None => return "https://api.openai.com/v1/chat/completions".to_string(),
    };
    if u.ends_with("/v1") {
        format!("{}/chat/completions", u)
    } else {
        format!("{}/v1/chat/completions", u)
    }
}

#[derive(serde::Serialize, Clone)]
pub struct StreamChunk {
    pub text: Option<String>,
    pub thought: Option<String>,
    pub is_final: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_response: Option<serde_json::Value>,
}

pub async fn generate_response_stream(
    app: AppHandle,
    event_name: String,
    config: ModelConfig,
    system_instruction: String,
    messages: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let url = chat_completion_url(config.base_url.as_deref());
    let client = reqwest::Client::new();
    let mut msgs: Vec<serde_json::Value> = vec![serde_json::json!({"role": "system", "content": system_instruction})];
    msgs.extend(messages);
    let body = serde_json::json!({
        "model": config.model_name,
        "messages": msgs,
        "stream": true,
        "stream_options": { "include_usage": true },
        "response_format": { "type": "json_object" }
    });

    let auth = format!("Bearer {}", config.api_key);
    let req = client
        .post(&url)
        .header("Authorization", auth)
        .header("Content-Type", "application/json")
        .json(&body);

    let res = req.send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let mut full_content = String::new();
    let mut stream = res.bytes_stream();
    let mut buf = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        buf.push_str(&String::from_utf8_lossy(&chunk));
        while let Some(idx) = buf.find('\n') {
            let line = buf.drain(..=idx).collect::<String>();
            let line = line.trim();
            if let Some(data) = line.strip_prefix("data: ") {
                if data == "[DONE]" {
                    break;
                }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                    if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                        if let Some(first) = choices.first() {
                            if let Some(delta) = first.get("delta") {
                                if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                    full_content.push_str(content);
                                    let _ = app.emit(&event_name, StreamChunk {
                                        text: Some(content.to_string()),
                                        thought: None,
                                        is_final: false,
                                        full_response: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let out = parse_json_response(&full_content);
    let _ = app.emit(&event_name, StreamChunk {
        text: None,
        thought: None,
        is_final: true,
        full_response: Some(out.clone()),
    });
    Ok(out)
}

fn parse_json_response(s: &str) -> serde_json::Value {
    let s = s.trim();
    if let Some(start) = s.find('{') {
        if let Some(end) = s.rfind('}') {
            if end > start {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(&s[start..=end]) {
                    return v;
                }
            }
        }
    }
    serde_json::json!({ "content": s, "type": "text" })
}

pub async fn generate_response_non_stream(
    config: ModelConfig,
    system_instruction: String,
    messages: Vec<serde_json::Value>,
    user_content: String,
) -> Result<String, String> {
    let url = chat_completion_url(config.base_url.as_deref());
    let client = reqwest::Client::new();
    let mut msgs: Vec<serde_json::Value> = vec![serde_json::json!({"role": "system", "content": system_instruction})];
    msgs.extend(messages);
    msgs.push(serde_json::json!({"role": "user", "content": user_content}));

    let body = serde_json::json!({
        "model": config.model_name,
        "messages": msgs
    });

    let auth = format!("Bearer {}", config.api_key);
    let res = client
        .post(&url)
        .header("Authorization", auth)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("API error {}: {}", status, text));
    }

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;
    let content = json
        .get("choices")
        .and_then(|c| c.as_array())
        .and_then(|a| a.first())
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();
    Ok(content)
}
