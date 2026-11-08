# ADR 0005: API chat routing and device-local history

Status: accepted for M3. Platforms: Windows and Linux. API-only.

## Decision

Use WebView IndexedDB (`digipet.chat.v1`, schema v1, `conversations` store) as
transactional local conversation storage. Both WebView2 and WebKitGTK already
provide it, so no runtime dependency, native SQL permission or schema bridge is
needed. Transactions commit before reporting success; failures leave previously
committed records intact and show a storage error. The UI lists, continues,
deletes and clears conversations. Retain the latest 500 messages per conversation,
bounded to 2 MiB serialized JSON. Message status distinguishes complete, stopped
and failed partial replies. Unconfigured M2 stub chat stays local and unpersisted.
History persists independently from settings; Clear all never touches credentials.
History is not encrypted; IndexedDB deletion does not promise physical erasure.
SQLite remains an option if search, migrations or larger histories are needed.

`src/modules/ai-router.ts` selects the active route, checks consent before every
attempt, and applies bounded timeout/retry policy. M2 settings migrate without
changing the original endpoint's consent. Route identity is its existing random
credentialRef, bound by M2's Rust credential record to the exact URL and model.
New routes always require their own opt-in. Revocation and route selection are
saved in settings without provider requests. Credential values remain in Windows
Credential Manager / Linux Secret Service, never in IndexedDB or settings JSON.

Fallback defaults **off**, independently of per-provider consent. If explicitly
on, try the active route then other consented routes in configuration order;
skip unconsented routes. The active route itself must have consent. Only known
connection/transport failures, timeouts and HTTP 408/429/5xx allow retry/fallback.
Never retry or switch after visible output, user cancellation, authentication,
model, parsing or configuration errors. Default timeout is 60 seconds and retry
count zero; settings bound these to 1–120 seconds and 0–2 retries per provider.
The native deadline includes keychain lookup and all HTTP work in that attempt.
Retries can incur provider charges; explicit fallback can share the same recent
context/persona with more than one opted-in provider. Neither setting is consent
for an additional provider.

Rust sends `stream=true`, decodes bounded SSE byte chunks, and sends sanitized
text snapshots through Tauri IPC Channel. It also accepts JSON replies; HTTP
400/415/422 triggers one `stream=false` retry only at the same endpoint, under
the same deadline. Redirects stay disabled. An IPC ready notification closes the
abort-before-registration race. Stop drops the transport future; partial text
is saved with a stopped marker. Provider error bodies are never logged or passed
to the UI. The animation returns to idle after success, Stop, or a brief error.

Before user text is persisted, Rust reads configured credentials locally and
scrubs exact matches, including after restart. Responses scrub their request's
credential before IPC and withhold matching credential prefixes across chunks.
The frontend additionally redacts common credential patterns and allowlists
persisted fields. An unavailable keychain prevents unchecked text persistence;
consent revocation does not require unlocking it. This is defense in depth,
not a claim to recognize every arbitrary sensitive value. Default API context
contains the last 20 messages (configurable 1–100), plus an optional redacted
system prompt; no credential metadata or message-status fields are sent.

## Verification

CI retains Linux/Windows frontend, native checks/tests and installer builds.
SSE tests cover split UTF-8, CR/LF framing, comments, multiline data, termination,
truncation, bounds and secret-prefix handling. Router and UI test doubles cover
consent, explicit fallback, retries, abort races, progressive output, recovery,
history reopen/continue/delete/clear and redaction. Transport tests use loopback
servers and synthetic credentials only; no paid APIs or real keys.

## 中文摘要

M3 採用 Windows／Linux WebView 內建的 IndexedDB 交易儲存對話，無新增執行時套件；
每對話保留最近 500 則及最多 2 MiB，提供續聊、刪除及清空。金鑰仍僅存 M2 的 OS
金鑰庫；文字先遮蔽再保存。歷史不加密，刪除不保證實體安全抹除。

Router 每次嘗試皆檢查逐路由同意；fallback 預設關閉，明確啟用後也只嘗試已同意
供應商。已顯示回覆、停止、驗證／模型／解析錯誤皆不切換。預設逾時 60 秒、零重試。
API-only，不整合本機推論、下載模型或 M4 工具。
