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
#[tauri::command]
pub fn stop_api_reply(request_id: String, requests: tauri::State<'_, Requests>) {
    if let Ok(active) = requests.0.lock() {
        if let Some(sender) = active.get(&request_id) {
            let _ = sender.send(true);
        }
    }
}
async fn complete(
    client: &reqwest::Client,
    route: &Route,
    key: &str,
    text: &str,
) -> Result<String, String> {
    let mut response = client.post(format!("{}/chat/completions", route.base_url.trim_end_matches('/')))
        .bearer_auth(key)
        .json(&serde_json::json!({"model": route.model, "messages": [{"role":"user", "content":text}], "stream":false}))
        .send().await.map_err(|_| "API connection failed")?;
    if !response.status().is_success() {
        return Err(format!("API HTTP {}", response.status().as_u16()));
    }
    // Bound memory even when Content-Length is missing or misleading.
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "API response failed")? {
        if bytes.len() + chunk.len() > 1024 * 1024 {
            return Err("API response too large".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let body: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid API response")?;
    body.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
        .ok_or("Missing API reply".into())
}
async fn cancellable<T>(
    mut receiver: watch::Receiver<bool>,
    task: impl std::future::Future<Output = Result<T, String>>,
) -> Result<T, String> {
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
    let (sender, receiver) = watch::channel(false);
    {
        let mut active = requests.0.lock().map_err(|_| "Request state unavailable")?;
        if !active.is_empty() {
            return Err("A request is already active".into());
        }
        active.insert(request_id.clone(), sender);
    }
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
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|_| "API client unavailable")?;
        complete(&client, &route, &credential.api_key, &text).await
    };
    let output = cancellable(receiver, result).await;
    if let Ok(mut active) = requests.0.lock() {
        active.remove(&request_id);
    }
    output
}
#[cfg(test)]
mod tests {
    use super::*;
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
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
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
        assert_eq!(body["stream"], false);
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
}
