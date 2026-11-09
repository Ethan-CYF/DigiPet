# User Guide / 使用者指南

[繁體中文（香港）](#繁體中文香港) · [English](#english)

## 繁體中文（香港）

### 安裝及首次啟動

僅提供 Windows x64 NSIS 及 Linux x64 `.deb`／AppImage。版本維持 `0.1.0`，目前是
beta 準備工作，並不表示已公開發行。請先閱讀[安裝、SHA-256 和移除](install.md)。
**Unsigned / Unverified Publisher（未簽署／未驗證發行者）** 的警告屬預期情況；
確認可信來源及校驗碼後，由使用者決定是否安裝，受管理裝置可能禁止執行。
Windows 需要 WebView2；Linux 需 WebKitGTK 4.1、GTK 3 及相關系統依賴。

首次啟動先以原生 **Allow / 允許**／**Not now / 暫不允許** 對話框詢問 DigiPet
行事曆及日記工具授權，並在管理面板開啟 API 設定精靈。這兩個工具只讀寫自己的本機
JSON，不存取 OS 日曆或帳戶，因此沒有 Windows／Linux 系統日曆權限可要求。
拒絕後不會靜默啟用；Settings → **Local tool access / 本機工具授權** 可重新要求存取。
檔案工具保持拒絕，逐工具按 **Choose allowed folder** 才開啟系統資料夾選擇器。
滑過寵物會顯示 Chat／Appearance／Settings 輪盤；離開、Escape 或點外面收起，拖曳時隱藏。
之後滑過寵物按齒輪、右鍵點寵物，或聚焦後按
`Ctrl+,` → **Settings / 設定** 可重新開啟。平常關閉時只有透明背景的寵物；點寵物
只開關輕量聊天泡泡，Escape 關閉並把焦點還給寵物，開啟聊天時聚焦輸入欄。
管理面板的 **Conversations / 對話** 管理歷史；**Tools & state / 工具與狀態** 提供
本機工具、AI 工具開關及動畫狀態除錯。兩個介面不會同時疊在寵物上方。
可儲存「啟動時開啟聊天」和「還原上次對話」偏好。托盤 Quit 才退出程式，隱藏不等於退出。
`Ctrl+Shift+P` 顯示／隱藏，`Ctrl+Shift+I` 開關透明區域穿透；Wayland 不提供這兩個全域快捷鍵。
拖曳移動寵物；Windows／X11 會盡力還原位置，多螢幕／縮放仍需人工驗證。

### API 設定 → 第一則聊天

1. 準備供應商的 **HTTPS base URL**、**model ID** 和自己的 API key。
   base URL 不包含 `/chat/completions`，程式會自行附加；不接受帳密、query 或 fragment。
   設定不會查詢模型清單或下載模型。
2. 輸入三個欄位，閱讀 **Cloud consent**：近期對話、可選角色提示、模型 ID、驗證金鑰，
   以及使用工具時的選取內容／結果，可能送到你同意的供應商，受其政策及收費限制。
   勾選後按 **Save / 儲存**。更改端點會清除勾選，需重新同意。
3. 金鑰存入 Windows Credential Manager 或 Linux Secret Service，不會填回 UI。
   Linux 需要已解鎖的桌面金鑰庫與 session D-Bus；失敗時解鎖後重試，或按 **Skip for now**。
   不會改用明文檔案。儲存成功只代表設定／憑證已保存，不表示 API 已驗證可用。
4. 輸入一則不含敏感資料的訊息，按 Enter 或 ↑。回覆可逐步串流；**Stop / 停止**
   取消本機等待並保留部分回覆，不能保證供應商停止計費。
5. 失敗時檢查端點、模型、網絡及供應商帳戶；錯誤不會顯示原始供應商回應。
   可重設目前工作或回設定修正，毋須刪除資料。

**Skip-model/API flow** 只指略過 API 設定並保留固定本機 stub：
`(M0 stub) 收到：<text>`。不選擇、安裝或下載任何本機模型，stub 也不保存聊天歷史。
未設定 API 的 stub 不連供應商；手動更新查詢是獨立操作。

設定可新增最多 8 個路由，選取目前路由、撤回個別同意或移除供應商。
**Enable fallback** 預設關閉；明確啟用後也只會嘗試已同意的路由。
驗證／模型錯誤、停止或已顯示部分輸出時不切換供應商。
預設逾時 60 秒、重試 0 次，可設 1–120 秒及 0–2 次。
預設 context 為最近 20 則，可改為 1–100；Persona 是可選 system 提示。
請勿在提示、聊天、檔名或工具內容放入密碼；遮蔽不能可靠識別所有任意秘密。

### 工具與權限

在 Settings → **Local tool access / 本機工具授權** 展開 **Tool permissions / 工具權限**，逐工具啟用。檔案存取另外按
**Choose allowed folder / 選擇允許資料夾**，每工具分開授權；可撤銷資料夾或整個工具。
管理面板 → **Tools & state / 工具與狀態** 勾選 **AI tools / AI 工具** 後，供應商可提出工具操作。
工具模式用非串流回合，仍受路由同意及 Stop 控制。所有工具資料寫入均先顯示完整
**Before / After**；只有你按 **Confirm write / 確認寫入** 才執行。拒絕或停止不寫入。
寫入預覽在管理面板自動顯示。Escape 只隱藏面板；重新按齒輪可繼續確認或拒絕，
不會自動批准或丟棄待核准寫入。Stop 會安全拒絕待核准 AI 寫入。
確認前再檢查權限、路徑及原內容；檔案改變需新預覽。模型不能授權或自行確認。

| 工具 | 現有能力及限制 |
| --- | --- |
| Calendar | 本機事件新增／列出／更新／刪除、ICS 匯入／匯出；單次 UTC `YYYYMMDDTHHMMSSZ`，無重複事件／時區或雲端同步。程式執行時才提醒。 |
| Report | 以標題及內文產生簡單 Markdown 或已跳脫 HTML 報告，寫入允許資料夾。 |
| Journal | 按 `YYYY-MM-DD` 新增、列出、搜尋及編輯本機日記。 |
| Coding | 讀取獲授權專案檔、建議／解釋及完整檔案替換預覽；不執行 shell。 |
| File Search | 搜尋允許資料夾的檔名／UTF-8 內容，遵守 `.gitignore`，略過隱藏、二進位及 >128 KiB 檔；最多 10,000 項目、50 筆結果。 |

不要授權包含秘密的資料夾。路徑檢查會阻擋 traversal、symlink／Windows reparse point、
系統與已知憑證路徑，但這不是 OS 沙箱，亦不能保證判斷所有敏感檔案。
工具資料在應用程式 local data `tools/tools-v1.json`；`tools/audit-v1.log` 只存時間、工具及
結果代碼，不存路徑、內文或金鑰，超過約 1 MiB 輪替。

### Pet packs：現有外觀庫及匯入

點 **Appearance / 外觀**（亦可從輪盤開啟），匯入後預覽並儲存套用；可切換、
刪除本機副本及還原預設，來源檔案不受影響。最多 8 個外觀，使用 WebView localStorage 保存。

- 單圖：選 PNG，以原圖像素輸入 x、y、width、height 裁切；最長邊縮至 256。
  動作是呼吸、浮動等程序動畫，不生成新影格或 AI 去背。
- Sprite sheet：選等格 PNG，再選 JSON／編輯設定；索引由 0 起、由左至右再由上至下。
  1–30 FPS，七狀態 `idle`, `walk`, `happy`, `thinking`, `talking`, `sleep`, `sad`；
  缺少的非 idle 動作回退 idle。
- PNG ≤2 MiB、每邊 ≤2048；JSON ≤32 KiB、每邊 ≤32 格、總共 ≤256 格。
  拒絕 SVG、APNG、URL、路徑、可執行欄位及未知狀態。不解壓 ZIP、不執行素材程式碼。
  Pet packs 不代表商店、雲端素材服務或其他寵物平台格式。

最小等格設定例子：

```json
{"version":1,"columns":2,"rows":1,"fps":8,"states":{"idle":[0],"walk":[0,1],"happy":[1,0],"thinking":[0],"talking":[0,1],"sleep":[0],"sad":[1]}}
```

### 離線、保存與資料匯出／刪除

離線仍可使用外觀、設定、已有歷史及 **Local tools (offline) / 本機工具（離線）**。
本機工具面板提供行事曆、日記及檔案搜尋，不呼叫 AI；授權及每次寫入確認仍然適用。
已設定 API 的聊天會提示需連線，不會改成本機模型。離線 UI 同時阻止傳送 stub；恢復網絡狀態後才可繼續聊天。

API 對話存於 WebView IndexedDB `digipet.chat.v1`；可選 Conversation 繼續、New 新增、
Delete 刪除選取對話、Clear all 清空。每個對話保存最近 500 則及最多 2 MiB JSON。
停止／失敗可保存部分回覆及狀態，重啟後保留；這些內容可能進入後續 context。

在 Settings → **Data & recovery / 資料與復原** → **History & recovery**：

- **Export history**：下載 `digipet-history.json`，只含對話欄位，不含設定、路由、素材、
  工具資料、授權或備份。會遮蔽已設定金鑰及常見秘密格式；金鑰庫不可讀時拒絕匯出。
  匯出仍可能含私人對話，分享前自行檢查。
- **Delete all chat history** → **Confirm deletion**：刪除所有對話及隔離歷史，
  不刪行事曆、日記、外觀或授權。只是邏輯刪除，不是磁碟安全抹除。
- **Backup & repair**：先本機備份損壞資料，再修復可修部分；正常資料盡量保留。
  備份可能含私人資訊，不隨歷史匯出。

外觀可在外觀庫個別刪除，事件可用 Calendar 刪除；工具亦有既有 ICS／報告匯出。
設定移除 API 路由／停用 API 會嘗試清除對應 keychain 項目；鎖定時可能須由使用者另行清理。
沒有整個應用程式的一鍵匯出／刪除功能，也沒有通用日記刪除介面。
解除安裝通常保留資料；完整目錄與移除說明見[安裝指引](install.md)。
聊天、工具資料、素材、備份及匯出不加密；OS 金鑰庫只保護 API 憑證。

### 手動檢查更新

在 Settings → **Updates / 更新** 按 **Check for updates / 檢查更新**，才向固定 GitHub API 查詢較新的正式版本。
查詢只帶版本 User-Agent 和一般 HTTP metadata，沒有金鑰、聊天或裝置 ID；不跟隨重新導向。
較新版本會提供版本頁連結，由你手動下載、核對 SHA-256 再安裝。沒有 timer、背景啟動查詢或
自動下載／安裝。離線、沒有正式版本、被限流或回應無效時不顯示通知。

### 疑難排解

| 情況 | 處理方法 |
| --- | --- |
| 安裝被 SmartScreen／企業政策阻擋 | 核實來源和 SHA-256，再由使用者決定；不要繞過組織政策。 |
| Windows 無法顯示視窗 | 確認 WebView2 Runtime；缺少／離線安裝路徑尚未驗證。 |
| Linux AppImage 無法啟動 | 檢查 WebKitGTK／GTK 等系統依賴；FUSE 不可用可用 extract-and-run，詳見 install.md。 |
| API 儲存失敗 | 解鎖 OS 金鑰庫；Linux 檢查 Secret Service 與 session D-Bus，或暫時略過。 |
| API 驗證／模型／限流錯誤 | 核對端點、model ID、帳戶權限／額度，稍後重試；勿把 key 貼進 issue。 |
| 工具拒絕或預覽過期 | 重新確認工具／資料夾授權及路徑，檔案有變更則重做預覽；不可讓模型自行確認。 |
| 找不到托盤／穿透／快捷鍵 | 檢查桌面支援或快捷鍵衝突；Wayland 有意停用相關功能，可選 X11。 |
| 儲存失敗／損壞 | 檢查磁碟空間／權限，再於設定明確備份修復；不要直接刪資料目錄。 |

[已知問題](known-issues.md)列出未驗證環境。[Beta 計劃](beta-test-plan.md)內的真實 API、
keychain 及實體裝置檢查全部為 **NOT RUN / USER ACTION REQUIRED**。

## English

### Installation and first launch

Only Windows x64 NSIS and Linux x64 `.deb`/AppImage are provided. The version stays
`0.1.0`; beta preparation does not imply a published release. Follow the
[install, SHA-256 and uninstall guide](install.md). **Unsigned / Unverified Publisher**
warnings are expected. Verify the source and checksum before deciding to install;
managed devices may prohibit unsigned software. Windows needs WebView2; Linux needs
WebKitGTK 4.1, GTK 3 and host dependencies.

First launch proactively shows a native **Allow / Not now** dialog for DigiPet's local
Calendar and Journal, and the API wizard in the controls panel. These tools use their
own local JSON, not OS calendars/accounts, so there is no corresponding Windows/Linux
OS-calendar permission to request. Declining keeps access denied. Settings → **Local
tool access** can request it again. File tools remain denied until you explicitly use
**Choose allowed folder** for each tool; this opens the system folder picker.
Hovering the pet shows a compact Chat / Appearance / Settings wheel. Leaving, Escape,
or clicking outside dismisses it; dragging hides it.
 Hover the pet for the gear,
right-click the pet, or press `Ctrl+,` while focused → **Settings** to reopen it.
Normal closed mode shows only the pet on a transparent background. Clicking the pet
opens a lightweight speech bubble and focuses its input; Escape closes it and restores
pet focus. The controls panel holds **Conversations** and **Tools & state** (local tools,
AI tools and animation debugging). Chat and controls appear one at a time.
Settings shows one category at a time: API & preferences, Local tool access, Data & recovery,
and Updates. Save Open chat on startup and Restore last conversation preferences as
needed. Tray Quit exits; hiding does not. `Ctrl+Shift+P` shows/hides and
`Ctrl+Shift+I` toggles transparent-area click-through. These global shortcuts are
disabled on Wayland. Drag to move; Windows/X11 attempt position restoration.
Physical monitor/DPI behavior remains unverified.

### API setup → first chat

1. Obtain the provider's **HTTPS base URL**, **model ID** and your own API key.
   Omit `/chat/completions`: DigiPet appends it. URL credentials, query and fragment
   are rejected. Setup does not discover or download models.
2. Enter all three fields, read **Cloud consent**, check it and press **Save**.
   Recent messages, optional persona, model ID, authentication key and selected
   tool content/results may reach consented providers under their privacy/billing
   policies. Changing the endpoint clears consent and requires a new opt-in.
3. Credentials are stored in Windows Credential Manager or Linux Secret Service,
   never filled back into the UI. Linux requires an unlocked keychain and session
   D-Bus. Unlock/retry or **Skip for now** on failure; no plaintext fallback.
   Successful saving does not prove API connectivity or credential validity.
4. Send a nonsensitive first message with Enter or ↑. Responses can stream.
   **Stop** cancels locally and retains partial output; the provider may still bill.
5. For errors, check endpoint, model, network and provider account. Raw provider
   bodies are not displayed. Reset the current task or correct Settings without deleting data.

**Skip-model/API flow** means skipping API setup and retaining the fixed local
`(M0 stub) 收到：<text>` response. No local model selection, installation or download;
stub chats are not persisted and make no provider call. Manual update checks are separate.

Manage up to eight routes, select the active route, revoke consent or remove a
provider. **Enable fallback** is off by default; opted-in fallback uses consented
routes only. Authentication/model errors, Stop and partial visible output prevent
cross-provider fallback. Default timeout/retries: 60 seconds/0; ranges: 1–120 seconds/0–2.
Context defaults to the latest 20 messages (1–100 configurable); Persona is an
optional system prompt. Never put passwords in prompts, chat, filenames or tool
content; redaction cannot reliably detect arbitrary unknown secrets.

### Tools and permissions

Settings → **Local tool access** → **Tool permissions** enables tools individually. File access also needs
**Choose allowed folder** for each tool. Revoke folders or entire tools there.
Check **AI tools** in the controls panel → **Tools & state** to let the consented provider propose operations.
Tool turns are nonstreaming and still honor route consent and Stop. Every tool
data write displays **Before / After** and waits for your **Confirm write**.
Rejecting/stopping writes nothing. Confirmation rechecks grants, paths and original
contents; changed files need a new preview. The model cannot grant or confirm.

| Tool | Implemented behavior and limits |
| --- | --- |
| Calendar | Local create/list/update/delete and ICS import/export; single UTC `YYYYMMDDTHHMMSSZ` events, no recurrence, time zones or cloud sync. Reminders require the app to be running. |
| Report | Simple title/body template exported as Markdown or escaped HTML into a granted folder. |
| Journal | Create, list, search and edit local entries by `YYYY-MM-DD`. |
| Coding | Read granted project files, explain/suggest and preview whole-file replacements; no shell execution. |
| File Search | Granted filename/UTF-8 search honoring `.gitignore`; excludes hidden/binary/>128 KiB files, at most 10,000 visited items and 50 results. |

Avoid granting secret-bearing folders. Traversal, symlink/Windows reparse points,
system and known credential paths are blocked, but this is not an OS sandbox or a
universal sensitive-file classifier. Local data lives in `tools/tools-v1.json`.
`tools/audit-v1.log` contains only timestamps, tools and outcome codes, rotates at
about 1 MiB and excludes content, paths and keys.

### Pet packs: existing appearance library/import

Open **Appearance** (also available from the wheel), import, preview and save/apply.
Select, delete local copies or restore defaults without modifying source files.
At most eight appearances persist in WebView localStorage.

- Single PNG: crop in source-image x/y/width/height pixels, resized to a maximum
  edge of 256. Motion is procedural breathing/floating, with no generated frames or AI background removal.
- Sprite sheet: equal-cell PNG plus selected/edited JSON. Zero-based row-major
  indices, 1–30 FPS, seven states: idle/walk/happy/thinking/talking/sleep/sad.
  Missing non-idle frames fall back to idle. The Chinese section contains a valid minimal manifest.
- PNG ≤2 MiB and ≤2048 pixels per edge; JSON ≤32 KiB, ≤32 cells per edge and ≤256
  total cells. SVG, APNG, URLs, paths, executable fields and unknown states are
  rejected. No ZIP extraction or executable pack code. Packs do not mean a store,
  cloud asset service or another pet platform's format.

### Offline, persistence, export and deletion

Appearances, settings, existing history and **Local tools (offline)** work offline.
The local panel provides calendar, journal and file search without AI, with the
same grants and per-write confirmations. Configured API chat requires network and
does not switch to a local model. The offline UI also blocks stub sends; restore network status before sending chat.

API conversations live in WebView IndexedDB `digipet.chat.v1`. Select Conversation
to continue, New to create, Delete for the selected conversation or Clear all.
Each conversation retains at most 500 recent messages and 2 MiB JSON. Partial
stopped/error responses and status persist across restart and can enter later context.

Write previews open in the controls panel. Escape hides the panel while preserving
pending approval; reopen with the gear to confirm or reject. Stop safely rejects a
pending AI write. Closing the panel never approves a write.

Settings → **Data & recovery** → **History & recovery**:

- **Export history** downloads `digipet-history.json` with allowlisted conversation
  fields only, excluding settings, routes, assets, tool data, grants and backups.
  Configured credentials/common secret patterns are redacted; unavailable keychain
  reads fail closed. Private conversation content may remain: review before sharing.
- **Delete all chat history** → **Confirm deletion** removes conversations and
  quarantined history, preserving calendar, journal, appearances and grants.
  This is logical deletion, not secure disk erasure.
- **Backup & repair** backs damaged data up locally before repair and retains
  healthy components where possible. Backups can contain private data and are excluded from history exports.

Delete appearances individually; Calendar supports event deletion and existing tools
support ICS/report exports. Removing routes/disabling API attempts keychain deletion;
locked stores may need separate user cleanup. No application-wide export/delete
button or general journal-delete UI exists. Uninstall normally preserves user data;
see [installation](install.md) for directories/removal. Chat, tool data, assets,
backups and exports are unencrypted; the OS keychain protects API credentials only.

### Manual update checks

Settings → **Updates** → **Check for updates** explicitly requests newer stable metadata from
fixed GitHub endpoints. Requests include a version User-Agent and ordinary HTTP
metadata, without keys, chat or device IDs; redirects are disabled. Open the offered
release page, download, verify SHA-256 and install manually. No startup/background
timer check, automatic download or installation. Offline, absent releases, rate
limits and malformed responses produce no notice.

### Troubleshooting

| Symptom | Action |
| --- | --- |
| SmartScreen/enterprise installation block | Verify source and SHA-256, then decide; respect organization policy. |
| No Windows window | Check WebView2 Runtime; missing/offline runtime paths remain untested. |
| AppImage fails | Check host WebKitGTK/GTK dependencies; use extract-and-run without FUSE as described in install.md. |
| API save fails | Unlock the keychain; check Linux Secret Service/session D-Bus, or skip setup. |
| Authentication/model/rate-limit error | Check endpoint/model/account access or quota; retry later, never paste keys into issues. |
| Tool denied/preview expired | Recheck tool/folder grants and paths; request a fresh preview after changes. The model cannot confirm itself. |
| Tray/click-through/shortcut unavailable | Check desktop support/conflicts. Wayland intentionally disables relevant features; consider X11. |
| Storage failure/corruption | Check space/permissions, then explicitly back up/repair in Settings; avoid deleting data directories. |

See [known issues](known-issues.md). Real API, real keychain and physical-device
checks in the [beta plan](beta-test-plan.md) are **NOT RUN / USER ACTION REQUIRED**.
