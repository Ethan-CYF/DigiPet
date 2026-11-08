//! API-only boundary. Never return keychain/provider errors or credential values to the UI.
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Mutex, time::Duration};
use tokio::sync::watch;
const SERVICE: &str = "io.github.ethan-cyf.digipet.api.v1";
const KEYCHAIN_ERROR: &str = "Secure keychain unavailable";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Route {
    kind: String,
    base_url: String,
    model: String,
    credential_ref: String,
}
#[derive(Serialize, Deserialize)]
struct Credential {
    base_url: String,
    model: String,
    api_key: String,
}
#[derive(Default)]
pub struct Requests(Mutex<HashMap<String, watch::Sender<bool>>>);
fn validate(base: &str, model: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(base).map_err(|_| "Invalid API URL")?;
    if base.len() > 2048
        || url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || model.trim().is_empty()
        || model.len() > 200
        || model.chars().any(char::is_control)
    {
        return Err("Invalid API configuration".into());
    }
    Ok(url)
}
fn entry(reference: &str) -> Result<keyring::Entry, String> {
    uuid::Uuid::parse_str(reference).map_err(|_| "Invalid credential reference")?;
    keyring::Entry::new(SERVICE, reference).map_err(|_| KEYCHAIN_ERROR.into())
}
#[tauri::command]
pub async fn save_api_credential(
    base_url: String,
    model: String,
    api_key: String,
) -> Result<String, String> {
    validate(&base_url, &model)?;
    if api_key.is_empty()
        || api_key.len() > 4096
        || api_key.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return Err("Invalid API key".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let reference = uuid::Uuid::new_v4().to_string();
        let secret = serde_json::to_string(&Credential {
            base_url,
            model,
            api_key,
        })
        .map_err(|_| KEYCHAIN_ERROR)?;
        entry(&reference)?
            .set_password(&secret)
            .map_err(|_| KEYCHAIN_ERROR)?;
        Ok(reference)
    })
    .await
    .map_err(|_| KEYCHAIN_ERROR)?
}
#[tauri::command]
pub async fn remove_api_credential(credential_ref: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        match entry(&credential_ref)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(KEYCHAIN_ERROR.into()),
        }
    })
    .await
    .map_err(|_| KEYCHAIN_ERROR)?
}
/// No provider calls: scrub saved keys inside the keychain boundary before history writes.
#[tauri::command]
pub async fn redact_chat_text(
    text: String,
    credential_refs: Vec<String>,
) -> Result<String, String> {
    redact_bounded(text, credential_refs, 16000).await
}
/// History exports redact whole fields before JSON escaping; never split a secret at chunk boundaries.
#[tauri::command]
pub async fn redact_export_text(
    text: String,
    credential_refs: Vec<String>,
) -> Result<String, String> {
    redact_bounded(text, credential_refs, 8 * 1024 * 1024).await
}
async fn redact_bounded(
    text: String,
    credential_refs: Vec<String>,
    limit: usize,
) -> Result<String, String> {
    if text.len() > limit || credential_refs.len() > 8 {
        return Err("Invalid message".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut clean = text;
        for reference in credential_refs {
            let secret = entry(&reference)?
                .get_password()
                .map_err(|_| KEYCHAIN_ERROR)?;
            let credential: Credential =
                serde_json::from_str(&secret).map_err(|_| KEYCHAIN_ERROR)?;
            clean = clean.replace(&credential.api_key, "[REDACTED]");
        }
        Ok(clean)
    })
    .await
    .map_err(|_| KEYCHAIN_ERROR)?
}
#[tauri::command]
pub fn stop_api_reply(request_id: String, requests: tauri::State<'_, Requests>) {
    if let Ok(active) = requests.0.lock() {
        if let Some(sender) = active.get(&request_id) {
            let _ = sender.send(true);
        }
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Message {
    role: String,
    content: String,
}
#[derive(Clone, Serialize)]
pub struct Update {
    ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
}

// Incremental byte framing preserves split UTF-8 and CR/LF boundaries.
#[derive(Default)]
struct Sse {
    pending: Vec<u8>,
    data: Vec<String>,
    output: String,
    done: bool,
    finished: bool,
}
impl Sse {
    fn event(&mut self) -> Result<(), String> {
        if self.data.is_empty() {
            return Ok(());
        }
        let data = self.data.join("\n");
        self.data.clear();
        if data == "[DONE]" {
            self.done = true;
            return Ok(());
        }
        let value: serde_json::Value =
            serde_json::from_str(&data).map_err(|_| "Invalid API stream")?;
        if value.get("error").is_some() {
            return Err("API stream error".into());
        }
        if let Some(text) = value
            .pointer("/choices/0/delta/content")
            .and_then(|v| v.as_str())
        {
            self.output.push_str(text);
        }
        if value
            .pointer("/choices/0/finish_reason")
            .is_some_and(|v| !v.is_null())
        {
            self.finished = true;
        }
        Ok(())
    }
    fn feed(&mut self, bytes: &[u8], eof: bool) -> Result<(), String> {
        self.pending.extend_from_slice(bytes);
        loop {
            let Some(pos) = self.pending.iter().position(|b| *b == b'\n' || *b == b'\r') else {
                break;
            };
            if self.pending[pos] == b'\r' && pos + 1 == self.pending.len() && !eof {
                break;
            }
            let skip = if self.pending[pos] == b'\r' && self.pending.get(pos + 1) == Some(&b'\n') {
                2
            } else {
                1
            };
            let line = String::from_utf8(self.pending[..pos].to_vec())
                .map_err(|_| "Invalid API stream")?;
            self.pending.drain(..pos + skip);
            if self.done {
                continue;
            }
            if line.is_empty() {
                self.event()?;
            } else if let Some(data) = line.strip_prefix("data:") {
                self.data
                    .push(data.strip_prefix(' ').unwrap_or(data).to_owned());
            }
        }
        if self.pending.len() > 65536 || self.data.iter().map(String::len).sum::<usize>() > 65536 {
            return Err("API event too large".into());
        }
        if eof {
            if !self.pending.is_empty() {
                return Err("Incomplete API stream".into());
            }
            self.event()?;
            if !self.done && !self.finished {
                return Err("Incomplete API stream".into());
            }
        }
        Ok(())
    }
}
// Withhold any suffix that could be a split credential, then redact before IPC.
fn safe_output(text: &str, key: &str, finished: bool) -> String {
    let safe = text.replace(key, "[REDACTED]");
    if finished {
        return safe;
    }
    let withheld = (1..key.len())
        .filter(|n| key.is_char_boundary(*n) && safe.ends_with(&key[..*n]))
        .max()
        .unwrap_or(0);
    safe[..safe.len() - withheld].to_owned()
}
async fn complete_messages(
    client: &reqwest::Client,
    route: &Route,
    key: &str,
    messages: &[Message],
    mut update: impl FnMut(String),
) -> Result<String, String> {
    let url = format!("{}/chat/completions", route.base_url.trim_end_matches('/'));
    let mut response = client
        .post(&url)
        .bearer_auth(key)
        .json(&serde_json::json!({"model":route.model,"messages":messages,"stream":true}))
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "API timeout"
            } else {
                "API connection failed"
            }
        })?;
    // Some compatible servers explicitly reject streaming. Retry only this same endpoint.
    if matches!(response.status().as_u16(), 400 | 415 | 422) {
        response = client
            .post(&url)
            .bearer_auth(key)
            .json(&serde_json::json!({"model":route.model,"messages":messages,"stream":false}))
            .send()
            .await
            .map_err(|_| "API connection failed")?;
    }
    if !response.status().is_success() {
        return Err(format!("API HTTP {}", response.status().as_u16()));
    }
    let streaming = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.to_ascii_lowercase().starts_with("text/event-stream"));
    let mut bytes = Vec::new();
    let mut parser = Sse::default();
    let mut total = 0;
    while let Some(chunk) = response.chunk().await.map_err(|e| {
        if e.is_timeout() {
            "API timeout"
        } else {
            "API response failed"
        }
    })? {
        total += chunk.len();
        if total > 1024 * 1024 {
            return Err("API response too large".into());
        }
        if streaming {
            parser.feed(&chunk, false)?;
            update(safe_output(&parser.output, key, false));
            if parser.done {
                break;
            }
        } else {
            bytes.extend_from_slice(&chunk);
        }
    }
    let output = if streaming {
        parser.feed(&[], true)?;
        parser.output
    } else {
        let value: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| "Invalid API response")?;
        value
            .pointer("/choices/0/message/content")
            .and_then(|v| v.as_str())
            .ok_or("Missing API reply")?
            .to_owned()
    };
    let safe = safe_output(&output, key, true);
    update(safe.clone());
    Ok(safe)
}
#[cfg(test)]
async fn complete(
    client: &reqwest::Client,
    route: &Route,
    key: &str,
    text: &str,
) -> Result<String, String> {
    complete_messages(
        client,
        route,
        key,
        &[Message {
            role: "user".into(),
            content: text.into(),
        }],
        |_| {},
    )
    .await
}
async fn cancellable<T>(
    mut receiver: watch::Receiver<bool>,
    task: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
    if *receiver.borrow() {
        return Err("Request stopped".into());
    }
    tokio::select! {
        biased;
        _ = receiver.changed() => Err("Request stopped".into()),
        output = task => output,
    }
}
#[tauri::command]
pub async fn api_reply(
    request_id: String,
    route: Route,
    text: String,
    consent: bool,
    messages: Vec<Message>,
    timeout_ms: u64,
    on_update: tauri::ipc::Channel<Update>,
    requests: tauri::State<'_, Requests>,
) -> Result<String, String> {
    if !consent || route.kind != "openai-compatible" {
        return Err("Cloud consent required".into());
    }
    validate(&route.base_url, &route.model)?;
    uuid::Uuid::parse_str(&request_id).map_err(|_| "Invalid request ID")?;
    if text.trim().is_empty() || text.chars().count() > 500 {
        return Err("Invalid message".into());
    }
    if messages
        .last()
        .is_none_or(|m| m.role != "user" || m.content != text)
        || messages.len() > 101
        || messages.iter().any(|m| {
            !matches!(m.role.as_str(), "user" | "assistant" | "system")
                || m.content.len() > 1024 * 1024
        })
        || messages.iter().map(|m| m.content.len()).sum::<usize>() > 2 * 1024 * 1024
    {
        return Err("Invalid context".into());
    }
    let (sender, receiver) = watch::channel(false);
    {
        let mut active = requests.0.lock().map_err(|_| "Request state unavailable")?;
        if !active.is_empty() {
            return Err("A request is already active".into());
        }
        active.insert(request_id.clone(), sender);
    }
    let _ = on_update.send(Update {
        ready: true,
        text: None,
    });
    let result = async {
        let reference = route.credential_ref.clone();
        let secret = tauri::async_runtime::spawn_blocking(move || {
            entry(&reference)?
                .get_password()
                .map_err(|_| KEYCHAIN_ERROR.to_string())
        })
        .await
        .map_err(|_| KEYCHAIN_ERROR)??;
        let credential: Credential = serde_json::from_str(&secret).map_err(|_| KEYCHAIN_ERROR)?;
        // Bind credentials to the approved endpoint/model, including after settings tampering.
        if credential.base_url != route.base_url || credential.model != route.model {
            return Err("Credential route mismatch".into());
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_millis(timeout_ms.clamp(1000, 120000)))
            .build()
            .map_err(|_| "API client unavailable")?;
        complete_messages(&client, &route, &credential.api_key, &messages, |text| {
            let _ = on_update.send(Update {
                ready: false,
                text: Some(text),
            });
        })
        .await
    };
    let output = tokio::time::timeout(
        Duration::from_millis(timeout_ms.clamp(1000, 120000)),
        cancellable(receiver, result),
    )
    .await
    .unwrap_or_else(|_| Err("API timeout".into()));
    if let Ok(mut active) = requests.0.lock() {
        active.remove(&request_id);
    }
    output
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sse_handles_every_byte_boundary_utf8_comments_crlf_and_done() {
        let input = ": heartbeat\r\ndata: {\"choices\":[{\"delta\":{\"content\":\"你好\"}}]}\r\n\r\ndata: [DONE]\r\n\r\n";
        for boundary in 0..=input.len() {
            let mut parser = Sse::default();
            parser.feed(&input.as_bytes()[..boundary], false).unwrap();
            parser.feed(&input.as_bytes()[boundary..], true).unwrap();
            assert_eq!(parser.output, "你好");
            assert!(parser.done);
        }
        let mut parser = Sse::default();
        for byte in input.as_bytes() {
            parser.feed(&[*byte], false).unwrap();
        }
        parser.feed(&[], true).unwrap();
        assert_eq!(parser.output, "你好");
    }
    #[test]
    fn sse_supports_multiline_data_finish_reason_and_cr_only() {
        let mut parser = Sse::default();
        parser.feed(b"event: message\rdata: {\rdata: \"choices\":[{\"delta\":{\"content\":\"hi\"},\"finish_reason\":\"stop\"}]}\r\r",true).unwrap();
        assert_eq!(parser.output, "hi");
        assert!(parser.finished);
    }
    #[test]
    fn sse_rejects_truncation_provider_errors_bad_json_and_large_events() {
        for input in [
            "data: {}\n\n",
            "data: invalid\n\n",
            "data: {\"error\":{\"message\":\"fixture-private\"}}\n\n",
            "data: [DONE]",
        ] {
            let error = Sse::default().feed(input.as_bytes(), true).unwrap_err();
            assert!(!error.contains("fixture-private"));
        }
        assert!(Sse::default().feed(&vec![b'x'; 65537], false).is_err());
    }
    #[test]
    fn never_exposes_credential_prefixes_across_stream_chunks() {
        let key = "fixture-private-value";
        for n in 1..key.len() {
            assert_eq!(
                safe_output(&format!("hello {}", &key[..n]), key, false),
                "hello "
            );
        }
        assert_eq!(
            safe_output(&format!("hello {key}"), key, false),
            "hello [REDACTED]"
        );
        assert_eq!(safe_output("hello f", key, true), "hello f");
    }
    #[test]
    fn rejects_unsafe_configuration_without_echoing_input() {
        for url in [
            "http://example.test",
            "https://user:fake@example.test",
            "https://example.test?key=fake",
            "file:///tmp/key",
            "https://example.test/#fake",
        ] {
            let error = validate(url, "chat").unwrap_err();
            assert!(!error.contains("fake"));
        }
        assert!(validate("https://example.test/v1", "chat").is_ok());
        assert!(validate("https://example.test", "\n").is_err());
    }
    fn mock_server(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let response = format!(
            "HTTP/1.1 {status}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            if body.starts_with("data:") { "text/event-stream" } else { "application/json" }, body.len()
        );
        let task = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let count = socket.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..count]);
                if let Some(header_end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..header_end]).to_lowercase();
                    let length = headers
                        .lines()
                        .find_map(|line| line.strip_prefix("content-length: "))
                        .unwrap()
                        .parse::<usize>()
                        .unwrap();
                    if bytes.len() >= header_end + 4 + length {
                        break;
                    }
                }
            }
            socket.write_all(response.as_bytes()).unwrap();
            String::from_utf8(bytes).unwrap()
        });
        (address, task)
    }
    #[tokio::test]
    async fn posts_openai_compatible_request_and_parses_reply() {
        let (base_url, task) =
            mock_server("200 OK", r#"{"choices":[{"message":{"content":"hello"}}]}"#);
        let route = Route {
            kind: "openai-compatible".into(),
            base_url: format!("{base_url}/v1"),
            model: "fixture-model".into(),
            credential_ref: uuid::Uuid::new_v4().to_string(),
        };
        // HTTP is used only by this private transport test; production validates HTTPS first.
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        assert_eq!(
            complete(&client, &route, "fixture-secret", "test message")
                .await
                .unwrap(),
            "hello"
        );
        let request = task.join().unwrap();
        assert!(request.starts_with("POST /v1/chat/completions HTTP/1.1"));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer fixture-secret"));
        let body: serde_json::Value =
            serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(body["model"], "fixture-model");
        assert_eq!(body["messages"][0]["content"], "test message");
        assert_eq!(body["stream"], true);
    }
    #[tokio::test]
    async fn transport_streams_and_redacts_before_callback() {
        let (base_url, task)=mock_server("200 OK","data: {\"choices\":[{\"delta\":{\"content\":\"hello fixture-private\"}}]}\n\ndata: [DONE]\n\n");
        let route = Route {
            kind: "openai-compatible".into(),
            base_url,
            model: "chat".into(),
            credential_ref: uuid::Uuid::new_v4().to_string(),
        };
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let mut emitted = Vec::new();
        let output = complete_messages(
            &client,
            &route,
            "fixture-private",
            &[Message {
                role: "user".into(),
                content: "hi".into(),
            }],
            |s| emitted.push(s),
        )
        .await
        .unwrap();
        assert_eq!(output, "hello [REDACTED]");
        assert!(!emitted.is_empty());
        assert!(emitted.iter().all(|s| !s.contains("fixture-private")));
        task.join().unwrap();
    }
    #[tokio::test]
    async fn streaming_callback_arrives_before_response_finishes() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let (sent, observed) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut request = [0u8; 4096];
            assert!(socket.read(&mut request).unwrap() > 0);
            socket.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n").unwrap();
            let first = "data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n";
            write!(socket, "{:x}\r\n{}\r\n", first.len(), first).unwrap();
            socket.flush().unwrap();
            observed.recv_timeout(Duration::from_secs(5)).unwrap();
            let last =
                "data: {\"choices\":[{\"delta\":{\"content\":\" second\"}}]}\n\ndata: [DONE]\n\n";
            write!(socket, "{:x}\r\n{}\r\n0\r\n\r\n", last.len(), last).unwrap();
        });
        let route = Route {
            kind: "openai-compatible".into(),
            base_url,
            model: "chat".into(),
            credential_ref: uuid::Uuid::new_v4().to_string(),
        };
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let output = complete_messages(
            &client,
            &route,
            "fixture-private",
            &[Message {
                role: "user".into(),
                content: "hi".into(),
            }],
            |text| {
                if text == "first" {
                    let _ = sent.send(());
                }
            },
        )
        .await
        .unwrap();
        assert_eq!(output, "first second");
        server.join().unwrap();
    }
    #[tokio::test]
    async fn explicit_stream_rejection_retries_json_only_at_same_endpoint() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for (status, body) in [
                ("415 Unsupported Media Type", "stream unsupported"),
                (
                    "200 OK",
                    r#"{"choices":[{"message":{"content":"JSON reply"}}]}"#,
                ),
            ] {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut bytes = Vec::new();
                let mut buffer = [0u8; 4096];
                loop {
                    let n = socket.read(&mut buffer).unwrap();
                    if n == 0 {
                        break;
                    }
                    bytes.extend_from_slice(&buffer[..n]);
                    if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                        let length = headers
                            .lines()
                            .find_map(|l| l.strip_prefix("content-length: "))
                            .unwrap()
                            .parse::<usize>()
                            .unwrap();
                        if bytes.len() >= end + 4 + length {
                            break;
                        }
                    }
                }
                requests.push(String::from_utf8(bytes).unwrap());
                write!(socket,"HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();
            }
            requests
        });
        let route = Route {
            kind: "openai-compatible".into(),
            base_url,
            model: "chat".into(),
            credential_ref: uuid::Uuid::new_v4().to_string(),
        };
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        assert_eq!(
            complete(&client, &route, "fixture-private", "hi")
                .await
                .unwrap(),
            "JSON reply"
        );
        let requests = server.join().unwrap();
        assert!(requests
            .iter()
            .all(|r| r.starts_with("POST /chat/completions HTTP/1.1")));
        for (i, request) in requests.iter().enumerate() {
            let body: serde_json::Value =
                serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
            assert_eq!(body["stream"], i == 0);
        }
    }
    #[tokio::test]
    async fn provider_errors_never_echo_response_body() {
        let (base_url, task) = mock_server("401 Unauthorized", "fixture-secret");
        let route = Route {
            kind: "openai-compatible".into(),
            base_url,
            model: "chat".into(),
            credential_ref: uuid::Uuid::new_v4().to_string(),
        };
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        assert_eq!(
            complete(&client, &route, "fixture-secret", "hello")
                .await
                .unwrap_err(),
            "API HTTP 401"
        );
        task.join().unwrap();
    }
    #[tokio::test]
    async fn stop_drops_an_inflight_transport_request() {
        use std::io::Read;
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let (sender, receiver) = watch::channel(false);
        let server = std::thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut bytes = [0; 4096];
            assert!(socket.read(&mut bytes).unwrap() > 0);
            sender.send(true).unwrap();
            // Keep the request in flight without replying until cancellation is observed.
            std::thread::sleep(Duration::from_millis(50));
        });
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let route = Route {
            kind: "openai-compatible".into(),
            base_url,
            model: "chat".into(),
            credential_ref: uuid::Uuid::new_v4().to_string(),
        };
        let result = tokio::time::timeout(
            Duration::from_secs(5),
            cancellable(
                receiver,
                complete(&client, &route, "fixture-secret", "hello"),
            ),
        )
        .await
        .unwrap();
        assert_eq!(result.unwrap_err(), "Request stopped");
        server.join().unwrap();
    }
    #[test]
    fn tool_json_redaction_handles_escaped_credentials_in_arguments() {
        let key = "unit-\"fixture\\value";
        let args = serde_json::json!({"action":"patch","text":key}).to_string();
        let mut value =
            serde_json::json!({"content":key,"tool_calls":[{"function":{"arguments":args}}]});
        scrub_tool_value(&mut value, key);
        assert_eq!(value["content"], "[REDACTED]");
        let args: serde_json::Value = serde_json::from_str(
            value["tool_calls"][0]["function"]["arguments"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(args["text"], "[REDACTED]");
    }
    #[tokio::test]
    async fn function_call_transport_sends_registry_and_preserves_tool_roles() {
        let body = r#"{"choices":[{"message":{"role":"assistant","content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"calendar","arguments":"{\"action\":\"list\"}"}}]}}]}"#;
        let (base_url, server) = mock_server("200 OK", body);
        let route = Route {
            kind: "openai-compatible".into(),
            base_url,
            model: "fixture-model".into(),
            credential_ref: uuid::Uuid::new_v4().to_string(),
        };
        let client = reqwest::Client::builder().no_proxy().build().unwrap();
        let messages = vec![
            serde_json::json!({"role":"tool","tool_call_id":"previous","content":"fixture-private"}),
        ];
        let reply = complete_tool_messages(&client, &route, "fixture-private", &messages)
            .await
            .unwrap();
        assert_eq!(reply["tool_calls"][0]["function"]["name"], "calendar");
        let request = server.join().unwrap();
        let payload: serde_json::Value =
            serde_json::from_str(request.split("\r\n\r\n").nth(1).unwrap()).unwrap();
        assert_eq!(payload["tools"], digipet_tools::registry());
        assert_eq!(payload["stream"], false);
        assert_eq!(payload["messages"][0]["role"], "tool");
        assert_eq!(payload["messages"][0]["tool_call_id"], "previous");
        assert_eq!(payload["messages"][0]["content"], "[REDACTED]");
    }
}

// Scrub decoded JSON strings, including JSON-escaped text inside function arguments.
fn scrub_tool_value(value: &mut serde_json::Value, key: &str) {
    if key.is_empty() {
        return;
    }
    let encoded = serde_json::to_string(key).unwrap_or_default();
    let escaped = encoded
        .get(1..encoded.len().saturating_sub(1))
        .unwrap_or(key);
    fn visit(value: &mut serde_json::Value, key: &str, escaped: &str) {
        match value {
            serde_json::Value::String(text) => {
                *text = text
                    .replace(escaped, "[REDACTED]")
                    .replace(key, "[REDACTED]")
            }
            serde_json::Value::Array(values) => {
                values.iter_mut().for_each(|v| visit(v, key, escaped))
            }
            serde_json::Value::Object(fields) => {
                let old = std::mem::take(fields);
                for (name, mut value) in old {
                    visit(&mut value, key, escaped);
                    fields.insert(
                        name.replace(escaped, "[REDACTED]")
                            .replace(key, "[REDACTED]"),
                        value,
                    );
                }
            }
            _ => {}
        }
    }
    visit(value, key, escaped);
}

async fn complete_tool_messages(
    client: &reqwest::Client,
    route: &Route,
    key: &str,
    messages: &[serde_json::Value],
) -> Result<serde_json::Value, String> {
    let grants = digipet_tools::registry();
    let mut messages = serde_json::json!(messages);
    scrub_tool_value(&mut messages, key);
    let mut response = client.post(format!("{}/chat/completions",route.base_url.trim_end_matches('/'))).bearer_auth(key)
            .json(&serde_json::json!({"model":route.model,"messages":messages,"tools":grants,"tool_choice":"auto","stream":false})).send().await.map_err(|_| "API connection failed")?;
    if !response.status().is_success() {
        return Err(format!("API HTTP {}", response.status().as_u16()));
    }
    let mut bytes = vec![];
    while let Some(chunk) = response.chunk().await.map_err(|_| "API response failed")? {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err("API response too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let mut value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid API response")?;
    scrub_tool_value(&mut value, key);
    let reply = value
        .pointer("/choices/0/message")
        .ok_or("Missing API reply")?
        .clone();
    if reply["role"] != "assistant" {
        return Err("Invalid API response".into());
    }
    Ok(reply)
}

/// Tool turns use the same endpoint/keychain binding, cancellation and limits as M3.
/// No model-supplied tool definitions, permission changes or confirmations are accepted.
#[tauri::command]
pub async fn api_tool_turn(
    request_id: String,
    route: Route,
    consent: bool,
    messages: Vec<serde_json::Value>,
    timeout_ms: u64,
    on_update: tauri::ipc::Channel<Update>,
    requests: tauri::State<'_, Requests>,
) -> Result<serde_json::Value, String> {
    if !consent || route.kind != "openai-compatible" {
        return Err("Cloud consent required".into());
    }
    validate(&route.base_url, &route.model)?;
    uuid::Uuid::parse_str(&request_id).map_err(|_| "Invalid request ID")?;
    if messages.is_empty()
        || messages.len() > 150
        || serde_json::to_vec(&messages)
            .map_err(|_| "Invalid context")?
            .len()
            > 2 * 1024 * 1024
    {
        return Err("Invalid context".into());
    }
    for m in &messages {
        if !matches!(
            m["role"].as_str(),
            Some("system" | "user" | "assistant" | "tool")
        ) {
            return Err("Invalid context".into());
        }
    }
    let (sender, receiver) = watch::channel(false);
    {
        let mut active = requests.0.lock().map_err(|_| "Request state unavailable")?;
        if !active.is_empty() {
            return Err("A request is already active".into());
        }
        active.insert(request_id.clone(), sender);
    }
    let _ = on_update.send(Update {
        ready: true,
        text: None,
    });
    let task = async {
        let reference = route.credential_ref.clone();
        let secret = tauri::async_runtime::spawn_blocking(move || {
            entry(&reference)?
                .get_password()
                .map_err(|_| KEYCHAIN_ERROR.to_string())
        })
        .await
        .map_err(|_| KEYCHAIN_ERROR)??;
        let credential: Credential = serde_json::from_str(&secret).map_err(|_| KEYCHAIN_ERROR)?;
        if credential.base_url != route.base_url || credential.model != route.model {
            return Err("Credential route mismatch".into());
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_millis(timeout_ms.clamp(1000, 120000)))
            .build()
            .map_err(|_| "API client unavailable")?;
        complete_tool_messages(&client, &route, &credential.api_key, &messages).await
    };
    let result = tokio::time::timeout(
        Duration::from_millis(timeout_ms.clamp(1000, 120000)),
        cancellable(receiver, task),
    )
    .await
    .unwrap_or_else(|_| Err("API timeout".into()));
    if let Ok(mut active) = requests.0.lock() {
        active.remove(&request_id);
    }
    result
}

#[cfg(test)]
mod export_tests {
    #[tokio::test]
    async fn export_redaction_accepts_large_utf8_fields_without_relaxing_chat_limits() {
        let text = "歷史🦀".repeat(8000);
        assert!(super::redact_chat_text(text.clone(), vec![]).await.is_err());
        assert_eq!(
            super::redact_export_text(text.clone(), vec![])
                .await
                .unwrap(),
            text
        );
        assert!(
            super::redact_export_text("x".repeat(8 * 1024 * 1024 + 1), vec![])
                .await
                .is_err()
        );
    }
}
