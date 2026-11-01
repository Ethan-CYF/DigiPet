# ADR 0004: API-only setup and OS credential storage

- Status: Accepted for M2
- Date: 2026-11-02

## Decision

M1 is pet animation/appearance (complete). M2 is first-run/settings API setup plus routing, replacing the older separate M2-router/M3-wizard split. Target Windows and Linux only; no llama.cpp, Ollama, catalogs, model downloads or SHA pipeline. `inspectHardware` returns an API-only explanation; `downloadModel` rejects without doing work.

Use Rust `keyring` 3 (MIT OR Apache-2.0): Windows Credential Manager and Linux synchronous Secret Service with Rust crypto. This uses existing OS access control rather than introducing a vault password/master-key lifecycle via Stronghold. Linux requires session D-Bus and an unlocked persistent Secret Service. Missing/locked backends fail closed with a sanitized error; there is no file or browser credential fallback. Native dev dependencies include `libdbus-1-dev`.

Create a UUID reference per save under the fixed application keychain service. The secret entry contains the API key and its approved endpoint/model binding. The webview persists only an allowlisted versioned settings record: wizard completion, consent, route kind, HTTPS URL, model and `credentialRef`. No credential retrieval command exists. Replace settings before best-effort deletion of the previous entry; a storage failure cleans up the newly created entry. A locked keychain can leave orphaned entries; OS keychain management can remove them. API keys exist transiently in the password field/IPC/backend memory and are not logged or written to JSON files. Keychain isolation is the OS account boundary; it is not protection against a compromised account or application process.

Require explicit opt-in to the displayed endpoint before Save. Saving performs no HTTP calls. Sending a message invokes Rust, verifies consent, validates configuration again, retrieves the key and verifies its endpoint/model binding. Rust uses HTTPS certificate validation, a 60-second timeout, no redirects, a 1 MiB bounded response and sanitized transport/provider/keychain errors. CSP continues to forbid arbitrary frontend network calls. Only the current message is sent; chat history is not stored. Request cancellation drops the reqwest future through a watch channel; the frontend AbortSignal ignores late results. Cancelling cannot undo provider processing or billing. M2 does not stream.

Skipped/unset settings preserve the M0 stub. Restart restores completion, consent and the last route, and the key is retrieved only on Send. Reopening settings requires re-entering a key and fresh opt-in; Skip disables the route and attempts credential removal. Browser preview fails closed on secure saving.

## Validation

Frontend unit tests cover first run/skip/reopen, restart, consent gating, field validation, allowlist redaction, storage failure cleanup, safe errors, text rendering and cancellation/late replies. Native tests use loopback HTTP only through a private transport helper to verify the chat-completions path, authentication, JSON body and response/error handling; production always validates HTTPS before that helper. CI uses no real keys or paid APIs and runs Linux/Windows native checks, tests, packaging and Linux browser/startup smoke.

Manual desktop checks: on Windows and Linux with an unlocked keychain, save a provider configuration, restart and send; verify a reply and Stop during a slow response. Lock the keychain and verify a safe error, then unlock/retry. Replace settings, skip and inspect deletion in the OS keychain. Verify no keys in localStorage, logs or app-config files. Provider and native keychain runtime checks require a real desktop and user-supplied credentials and are not claimed by mocked CI tests.

## 中文摘要

M2 合併 API 設定精靈與 router，不下載模型。使用 OS 金鑰庫與隨機參照；金鑰不回傳前端、不存明文檔。Linux 金鑰庫需解鎖且提供 Secret Service；失敗不降級。明確同意後才可儲存，按傳送才會連線；HTTPS、禁轉址、逾時、回應大小限制、錯誤遮蔽與停止請求均由 Rust 處理。只傳單則訊息，不保存對話。CI 使用假憑證與本機假服務；真實桌面金鑰庫及供應商需另外實測。
