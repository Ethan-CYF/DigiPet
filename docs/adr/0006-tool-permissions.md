# ADR 0006: AI tools and permissions / AI 工具與權限

Status: Accepted (M4). Platforms: Windows and Linux. API-only; no local models.

The model may propose actions, but is not a security principal. The Rust `digipet-tools`
crate owns the JSON-schema registry, validates arguments again, stores tool data and
permissions, and performs all filesystem access. The five function names are the entire
model capability surface. Grant, confirm and cancel are separate UI IPC commands, never
model tools. The frontend only renders tool output as text.

Permissions start empty. Each tool must be enabled independently. File operations also
need a folder selected in the native picker for that tool. A grant permits reads and
write proposals; it never approves a write. Settings can revoke a tool and all its folders.
Revocation and cancellation invalidate outstanding previews. Persisted grants restore on
restart; open directory capabilities are reacquired only for valid roots.

Every tool-data mutation, including calendar/journal edits and ICS import, produces a
bounded before/after preview with an opaque, in-memory, one-use token. The human explicitly
accepts or rejects the exact contents. No token is sent to the model. Confirmation checks
permissions, paths and the original contents again; changes require a fresh preview.
Permissions, audit and application settings are infrastructure writes initiated by explicit
UI choices, not model tools. Tool file access cannot target this engine's storage directory.

Absolute paths are canonicalized and checked against the tool's selected roots. Parent
components, hidden names, common credential names/extensions, system directories, symlinks,
Windows reparse points and alternate streams are denied. File IO uses retained `cap-std`
directory capabilities, so replacing a descendant with an outside symlink cannot redirect
access outside the selected root. Local OS administrators and malicious same-account
processes that alter application storage or directory handles are outside this application
boundary; the app does not provide an OS sandbox. Concurrent file edits are checked before
writing, but this is not a cross-process transaction. Avoid simultaneous external editors
while confirming a patch. M4 patches are whole-file replacement previews, not shell commands.

The orchestrator counts model turns and tool calls toward 12 steps (hard maximum 24),
supports Stop during generation and approval, and clears previews on completion. Tool turns
use the M3 router's opted-in routes, bounded timeout/retries and explicit fallback policy;
non-streaming OpenAI-compatible function calls preserve `tool_call_id`. Tool results use
`role: tool` and an untrusted-data envelope. A system instruction rejects embedded
instructions; backend permission checks and human confirmations enforce this regardless
of model behavior. Configured API keys are redacted at the keychain boundary. No paid calls
or real credentials are used in tests.

Data is local in application local data `tools/tools-v1.json`. Audit files contain only
UTC epoch timestamps, fixed tool names and outcome codes; never arguments, contents, paths
or provider errors. The audit rotates at 1 MiB with one previous file. Calendar reminders
run every 30 seconds while the app runs, once per event per session (overdue events appear
on restart). ICS supports single UTC VEVENTs, folding and escaped text; recurrence/timezones
are rejected explicitly. Search limits: 128 KiB per UTF-8 file, 10,000 entries, 50 matches,
1,000-character excerpts; hidden/binary files and ignore patterns are excluded.

繁體中文：模型只能提出五種工具呼叫，不能授權或確認。Rust 再次驗證 JSON schema，
預設拒絕所有工具與路徑；使用者逐工具啟用、以原生選擇器授權資料夾，並在設定撤銷。
每次工具資料寫入（含行事曆／日記與 ICS 匯入）都需顯示完整前後內容並明確確認；
一次性確認 token 不傳給模型。撤銷、取消會清除預覽，確認前重新檢查權限、路徑與原內容。
工具輸出視為不可信資料，不能因此執行 shell、修改權限或自動寫入。資料留在本機，
稽核只記錄固定代碼。此邊界不防禦已控制同一 OS 帳號或管理員的程式。
