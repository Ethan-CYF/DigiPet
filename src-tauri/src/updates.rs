//! Metadata-only update notices. No asset download, updater plugin or installation path.
use semver::Version;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri_plugin_opener::OpenerExt;

const LATEST: &str = "https://api.github.com/repos/Ethan-CYF/DigiPet/releases/latest";
const RELEASES: &str = "https://github.com/Ethan-CYF/DigiPet/releases/tag/";
const MAX_METADATA: usize = 256 * 1024;

#[derive(Deserialize)]
struct Release {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    published_at: Option<String>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNotice {
    version: String,
    tag: String,
    url: String,
}

fn stable_version(tag: &str) -> Option<Version> {
    if tag.len() > 128 {
        return None;
    }
    let version = Version::parse(tag.strip_prefix('v').unwrap_or(tag)).ok()?;
    version.pre.is_empty().then_some(version)
}

fn notice(bytes: &[u8], current: &str) -> Option<UpdateNotice> {
    let release: Release = serde_json::from_slice(bytes).ok()?;
    if release.draft
        || release.prerelease
        || release.published_at.as_deref().unwrap_or("").is_empty()
    {
        return None;
    }
    let available = stable_version(&release.tag_name)?;
    let installed = Version::parse(current).ok()?;
    // SemVer build metadata has no precedence (Version's total Ord includes it).
    if available.cmp_precedence(&installed).is_le() {
        return None;
    }
    Some(UpdateNotice {
        version: available.to_string(),
        url: format!("{RELEASES}{}", release.tag_name),
        tag: release.tag_name,
    })
}

async fn fetch_latest(client: &reqwest::Client, url: &str, current: &str) -> Option<UpdateNotice> {
    let mut response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .ok()?;
    if !response.status().is_success()
        || response
            .content_length()
            .is_some_and(|n| n > MAX_METADATA as u64)
    {
        return None;
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        if bytes.len() + chunk.len() > MAX_METADATA {
            return None;
        }
        bytes.extend_from_slice(&chunk);
    }
    notice(&bytes, current)
}

#[tauri::command]
pub async fn check_for_update() -> Option<UpdateNotice> {
    let client = reqwest::Client::builder()
        .user_agent(concat!("DigiPet/", env!("CARGO_PKG_VERSION")))
        .https_only(true)
        .redirect(reqwest::redirect::Policy::none())
        .connect_timeout(Duration::from_secs(3))
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    // No credentials, retries, timers, error bodies or failures are exposed/logged.
    fetch_latest(&client, LATEST, env!("CARGO_PKG_VERSION")).await
}

#[tauri::command]
pub fn open_release_page(app: tauri::AppHandle, tag: String) -> Result<(), String> {
    stable_version(&tag).ok_or("Invalid release version")?;
    app.opener()
        .open_url(format!("{RELEASES}{tag}"), None::<&str>)
        .map_err(|_| "Could not open release page".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn metadata(tag: &str) -> Vec<u8> {
        serde_json::to_vec(
            &json!({"tag_name": tag, "draft": false, "prerelease": false,
            "published_at": "2026-01-01T00:00:00Z"}),
        )
        .unwrap()
    }

    #[test]
    fn semver_precedence_and_stable_releases_only() {
        assert_eq!(
            notice(&metadata("v0.10.0"), "0.9.0").unwrap().version,
            "0.10.0"
        );
        assert!(notice(&metadata("1.0.0"), "1.0.0-rc.1").is_some());
        for tag in [
            "0.1.0",
            "v0.0.9",
            "0.1.0+build.9",
            "0.2.0-beta.1",
            "v01.2.0",
            "latest",
            "1.2",
            "../../other",
        ] {
            assert!(notice(&metadata(tag), "0.1.0").is_none(), "{tag}");
        }
        for field in ["draft", "prerelease"] {
            let mut data: serde_json::Value = serde_json::from_slice(&metadata("v1.0.0")).unwrap();
            data[field] = json!(true);
            assert!(notice(&serde_json::to_vec(&data).unwrap(), "0.1.0").is_none());
        }
        for body in [
            b"null".as_slice(),
            b"{}",
            b"[]",
            b"not JSON",
            br#"{"tag_name":"v1.0.0","draft":false,"prerelease":false}"#,
        ] {
            assert!(notice(body, "0.1.0").is_none());
        }
    }

    // Local HTTP fixtures only: exercise status handling, response bounds and actual transport.
    async fn mock_response(status: u16, body: Vec<u8>) -> Option<UpdateNotice> {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/latest", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let count = stream.read(&mut request).unwrap();
            assert!(!String::from_utf8_lossy(&request[..count])
                .to_lowercase()
                .contains("authorization:"));
            let _ = write!(
                stream,
                "HTTP/1.1 {status} Fixture\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(&body);
        });
        let client = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .unwrap();
        let result = fetch_latest(&client, &url, "0.1.0").await;
        server.join().unwrap();
        result
    }

    #[tokio::test]
    async fn mocked_github_responses_and_unreachable_server_are_silent() {
        let found = mock_response(200, metadata("v0.2.0")).await.unwrap();
        assert_eq!(found.url, format!("{RELEASES}v0.2.0"));
        assert!(mock_response(404, b"no published releases".to_vec())
            .await
            .is_none());
        assert!(mock_response(403, b"rate limited".to_vec()).await.is_none());
        assert!(mock_response(500, b"unavailable".to_vec()).await.is_none());
        assert!(mock_response(200, vec![b' '; MAX_METADATA + 1])
            .await
            .is_none());
        assert!(mock_response(200, b"invalid JSON".to_vec()).await.is_none());
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        assert!(fetch_latest(&reqwest::Client::new(), &url, "0.1.0")
            .await
            .is_none());
    }
}
