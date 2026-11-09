# M5 security notes / 安全摘要

DigiPet supports Windows and Linux, API-only. Models, files, imported PNGs/manifests,
calendar input and tool results are untrusted data. Assets, local conversations,
calendar/journal entries, folder grants and OS-keychain credentials are the assets
protected by the application boundary. A compromised OS account, administrator or
WebView runtime is outside this boundary; this is not an OS sandbox.

## Enforced boundaries

- Only the UI can grant folders, confirm writes or request recovery. The model
  registry exposes five existing M4 tools, with independent Rust schema validation.
  Unknown tools/fields, traversal, symlinks/reparse points, device/credential paths
  and writes to the tool database are rejected. One-use preview tokens never go to
  the model. Confirmation rechecks grants and original contents. Atomic replacement
  preserves existing file permissions. Nested search honors ancestor ignore files.
- PNG signatures, IHDR pixel format, dimensions (1–2048 each), every chunk length
  and CRC, ordering and terminal IEND are checked before browser decode. Inputs are
  at most 2 MiB; pixel allocation is bounded by the dimensions (up to 16 MiB for
  RGBA8). APNG and compressed text/ICC metadata are rejected, avoiding metadata
  decompression bombs. The browser decoder must still decode the bounded bitmap;
  malformed/empty bitmaps fall back visibly. Only PNG data URLs reach the decoder.
  Sheets allow at most 256 cells, 256 indices per state, seven known states and
  1–30 FPS; manifests are data-only, at most 32 KiB, with no URL/script/path fields.
- API credentials remain in the OS keychain. Only opted-in HTTPS endpoints receive
  context; fallback requires an explicit setting. Audit logs contain fixed codes,
  never input or provider bodies. History export uses an explicit field allowlist,
  redacts each text field with the configured keychain credentials **before JSON
  escaping** (the export-specific native command accepts bounded whole fields up to
  8 MiB, including large UTF-8 conversations), then applies common credential-pattern redaction. Arbitrary unknown
  secrets in user prose cannot be identified reliably; review exports before sharing.

## Recovery and persistence

Settings use explicit version 5 in the existing `digipet.api.v1` key. Only the
existing M2 single-route and M3/M4 route-array representations migrate; the original
is retained as `.pre-m5` before the new value is written. M1 appearance storage and
M4 tool data retain their actual v1 formats. No fictional legacy schema is accepted.
Settings corruption returns safe defaults in memory and does not overwrite disk.

Recovery is explicit in Settings. LocalStorage originals receive unique backups
before replacement; appearance repair retains independently valid entries. IndexedDB
v2 adds a recovery store without recreating the conversations store: damaged rows
are backed up and removed within one transaction, leaving healthy conversations
intact. If the database cannot open or backup fails, repair refuses to delete it.
Delete-all chat history explicitly clears conversations and quarantined history,
while leaving calendar, journal and grants intact.

Tool repair copies and syncs the original `tools-v1.json` to a unique backup before
replacement. Deserializable grants and individual calendar/journal records survive.
Unparseable components reset to empty; a wholly unparseable file cannot be salvaged
and resets only this tool store after backup. Other app data is untouched. Backups
remain local and may contain private information; they are excluded from exports.
Backend task/init panics discard only in-memory engine state and reopen persisted
state on the next operation. Pending approvals expire; persisted grants do not reset.
All tool IO runs on blocking workers, outside the UI thread. Provider failure/Stop
resets the current request without resetting settings, history or permissions.

## Reproducible evidence (mock providers only)

| Attack / failure | Required observable result | Coverage |
| --- | --- | --- |
| Model calls `tool_grant`, `tool_repair`, `tool_confirm`, shell or prototype names | No backend call or confirmation | `hardening.test.ts` |
| Generated unknown argument fields and `../` paths | Rust validation denies; grants unchanged; no file created | 256 proptest cases per property in `tools-core` |
| Symlink/junction, secret/system paths, DB overwrite, stale/replayed confirmation | Denial, no outside write | M4 Rust regression suite |
| 512 deterministic PNG byte mutations / out-of-grid frames | Rejected before decode / manifest acceptance | `hardening.test.ts` |
| Corrupt settings/history/tool component | Backup retained; healthy data and grants remain | TS and Rust recovery tests |
| Panic in backend task and initialization | Mutex remains usable; grants restore from disk | Native `tools` test |
| Offline calendar/journal writes, search and restart | Real Rust engine works through UI, existing grants restore | `offline-native.spec.ts` |
| Secret-bearing history and tool inputs | No fixture secrets in export/audit | TS export and Rust audit tests |

繁體中文：模型與匯入內容都不可信；授權、復原與寫入確認只由 UI 發起，Rust
再次檢查權限與路徑。圖片在解碼前驗證 PNG、尺寸、CRC、影格與解壓縮限制。
復原先備份，再修復損壞部分；可讀的正常對話、日記、行事曆與授權保留。整份工具
檔若無法解析，備份後只重設該工具儲存區；無法開啟的 IndexedDB 不會被自動刪除。
備份可能含私人資訊，只留本機，不會匯出；歷史匯出在 JSON 跳脫前逐欄位遮蔽
已設定金鑰，再進行格式遮蔽。測試僅用 mock、fixture 與本機工具，無真實 API 金鑰或付費呼叫。

## M7 scoped security audit / M7 範圍內安全審查

Reviewed 2026-11-09 (JST), starting at M6 merge `312f362`. The M5 history above is
preserved. This pass reviews existing boundaries and regressions; it is not an
independent penetration test, OS sandbox proof or dependency/supply-chain certification.
M7 保留以上 M5 歷史；以下只就已審查的程式路徑及測試作結論，不代表整個系統絕對安全。

### Scope and evidence / 範圍及證據

| Area / 範圍 | Inspected paths and result / 檢查及結果 |
| --- | --- |
| Permission-controlled writes | `tools-core/src/lib.rs`, `src-tauri/src/tools.rs`, `src/modules/tools.ts`, tool UI. Five-name registry/schema prevents model control commands; default-deny grants, per-tool folders, one-use UI preview tokens, revalidation, capability-relative atomic writes. Existing traversal, junction/symlink, stale/replay, revoke and injection regressions retained. No confirmed bypass found in reviewed paths. |
| API/keychain data flow | `api.rs`, `model-wizard.ts`, `ai-router.ts`, ApiSettings/App. HTTPS URL validation; credentials bound to endpoint/model in native storage; explicit per-route consent and fallback; redirects disabled; fixed error codes and bounded replies. No real keychain accessed in this audit. |
| History/export/redaction | `chat-history.ts`, `redaction.ts`, DataSettings and native redaction/SSE/tool response code. Allowlisted export, native credential scrubbing before JSON escaping, bounded whole UTF-8 fields; keychain-read failure refuses export. Existing split-secret/escaped-key/export regressions cover fake inputs. |
| Audit/application logs | Tool audit uses timestamp/tool/fixed outcome codes and rotation; denied tool errors do not echo input to model. Native UI warnings cover desktop operations. No confirmed logging of API credential values or raw provider error bodies in reviewed production paths. |
| CI logs/permissions | `.github/workflows/build.yml`, release scripts, credential scanner and test fixtures. Build/PR jobs have `contents: read`; only the pre-existing tag-event draft job has write permissions, unreachable from M7 branch pushes. No custom secrets or signing credentials required. Build failure tails contain compiler/bundler output; provider tests use fake values only. |
| Update network traffic | `updates.rs`, UpdateNotice/App. Fixed GitHub HTTPS metadata endpoint, no Authorization/chat/local files/device ID, redirect refusal, 256 KiB bound and 5-second timeout. M7 removes the startup request: only an explicit Settings click sends a query. Opening a release page is a second user action; browser/GitHub may observe ordinary network metadata. |

Cloud evidence: frontend 100 tests; release guards/integrity 5 tests; tools-core 22
Rust tests (including property cases); mock-model/real-Rust integration 6 tests;
Chromium 10 browser tests. Credential-pattern scan passed, reporting no matched
values. Native Tauri execution in Cloud is blocked by missing GObject/GTK/WebKit
system development prerequisites; native tests/installer validation are assigned
to the existing Windows/ubuntu-24.04 CI jobs, with final-head status recorded in
the task report. Browser tests use mock IPC and do not establish real keychain behavior.
雲端原生測試受系統開發依賴限制；不能把瀏覽器 mock 當作真實金鑰庫或實體裝置驗證。

### Findings and status / 發現及狀態

| ID | Severity / 等級 | Finding / 發現 | Status / 狀態 |
| --- | --- | --- | --- |
| M7-01 (M6 carry-over) | **P2 (unchanged)** | Successful Windows install without uninstall.exe silently skipped uninstall/registry/data checks. / 成功安裝但缺少卸載程式會跳過驗證。 | **Fixed**: explicit throw; Windows child-process negative fixture must exit non-zero for this error after successful simulated install/launch. Actual installer smoke still checks executable removal, HKCU cleanup and disposable sentinels. |
| M7-02 | P2 | Startup metadata query contradicted manual-check-only decision. / 啟動查詢不符合只准手動檢查的決策。 | **Fixed**: Settings click only; regression proves no startup request, explicit query/open and silent failures. No unrelated updater features added. |
| M7-03 | P2 residual | Consented tools intentionally send granted folder roots, selected file contents/results and local calendar/journal text to the provider. Path filters cannot classify all sensitive files; grants are not an OS sandbox. / 授權內容可能含私人資訊。 | **Documented**: review grants, avoid sensitive folders; no confirmed unauthorized destination/write bypass found in this pass. |
| M7-04 | P2 residual | Local chat/tool data, recovery copies and exported JSON are unencrypted; unknown secrets are not universally redactable. Uninstall may leave keychain entries and exports. / 本機資料不加密，任意秘密未必能遮蔽。 | **Documented**: component-specific cleanup/export scope, review exports and explicit user cleanup. No app-wide deletion feature introduced. |
| M7-05 | Validation gap | Real keychain lifecycle, real API billing, physical desktop/WebView interaction, interactive uninstall, missing WebView2, FUSE and Wayland not exercised. / 真實環境仍未驗證。 | **NOT RUN / USER ACTION REQUIRED**, see beta plan. No real credentials requested or used. |

**Conclusion within this scope:** no confirmed P0/P1 findings remain in the paths
reviewed. This does not claim absence of all vulnerabilities or completion of the
manual checks. P2 findings/residual risks are listed above. No architectural
rewrite, new security dependencies or unrelated features were introduced.
**範圍內結論：** 已審查路徑沒有已確認而未解決的 P0／P1；不代表不存在其他漏洞，亦不代表
人工測試已完成。P2 問題與殘留風險如上。
