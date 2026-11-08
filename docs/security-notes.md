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
  escaping**, then applies common credential-pattern redaction. Arbitrary unknown
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
