# DigiPet

[繁體中文（香港）](#繁體中文香港) · [English](#english)

## 繁體中文（香港）

DigiPet 是 MIT 授權的桌面寵物 AI 助理，使用 Tauri v2、React、TypeScript 和 Rust。
**v0.1.0 為 beta 準備階段，僅支援 Windows x64 和 Linux x64。** AI 只經
OpenAI-compatible API；沒有本機模型、模型下載、macOS 或 ARM64 版本。

**Unsigned / Unverified Publisher — 未簽署／未驗證發行者。** 安裝前核實來源和
SHA-256；校驗碼只能檢查檔案完整性，不能驗證發行者。M7 只準備原始碼、文件及 CI
artifacts，不建立 tag 或 GitHub Release。尚未完成的人工測試不代表已通過。

### 第一次使用

1. 按[安裝與 SHA-256 指引](docs/install.md)核對並安裝適合平台的檔案。
   Windows 需要 WebView2；Linux 以 Ubuntu 24.04 x64 為 CI 基準，需要 WebKitGTK 4.1／GTK 3 等依賴。
2. 首次啟動顯示 API 設定精靈；Calendar／Journal 只使用 DigiPet 本機 JSON，首次安裝及
   升級會預設啟用，不顯示授權對話框。Settings → Local tool access 可逐工具開關，
   之後的關閉選擇會保留。檔案工具預設拒絕，需使用系統資料夾選擇器選擇允許資料夾。
   可選 **Skip for now / 暫時略過** 保留本機 stub：
   `(M0 stub) 收到：<text>`；這不是 AI 或本機模型，也不會呼叫供應商。
3. 要用 API，填寫供應商的 **HTTPS base URL**（程式附加 `/chat/completions`）、
   **model ID** 和 **API key**，閱讀並勾選 **Cloud consent**，再按 **Save / 儲存**。
   儲存不會測試連線。金鑰只存於 Windows Credential Manager／Linux Secret Service；
   金鑰庫不可用時不會回退至明文，可解鎖重試或略過。
4. 在聊天輸入訊息，按 Enter 或 ↑ 傳送。近期訊息、角色提示及工具結果可傳至已同意的
   API 供應商，可能收費。**Stop / 停止** 取消本機請求；供應商可能已處理及計費。
5. 點寵物開關輕量聊天泡泡，Escape 關閉；平常關閉時只顯示透明背景的寵物。
   滑過寵物顯示 Chat／Appearance／Settings 輪盤，移開、Escape 或點外面會收起。
   亦可按齒輪、右鍵／聚焦後按 `Ctrl+,` 開啟獨立管理面板。
   **Settings / 設定** 管理 API、同意、偏好、資料及工具權限；外觀、對話和工具各有入口。所有外觀控制（選擇、PNG 上傳、類型、還原、刪除、上傳提示）
   及設定均只在次要介面，聊天泡泡不包含這些控制。
   不要在聊天或問題回報貼出金鑰。

完整步驟、疑難排解及資料界線見[雙語使用者指南](docs/user-guide.md)。

### 現有功能與界線

- **桌面操作：** 拖曳寵物；`Ctrl+Shift+P` 顯示／隱藏，`Ctrl+Shift+I` 切換透明區域穿透。
  托盤提供 Show / Hide、穿透及 Quit。Windows／X11 保存位置；Wayland 停用自動穿透、
  全域快捷鍵及位置還原。托盤、置頂、DPI、多螢幕及合成效果需實體桌面驗證。
- **API 對話：** 串流、停止、最多 8 個供應商路由、逐端點同意；fallback 預設關閉。
  本機 IndexedDB 保存對話，支援繼續、刪除、清空和 JSON 匯出；stub 不保存聊天歷史。
- **工具與權限：** Calendar／Journal 預設啟用，可在設定關閉；Report、Coding、File Search
  預設拒絕，需在 Tool permissions 選擇允許資料夾才啟用；管理面板 → Tools & state 勾選 AI tools。
  每次工具資料寫入先顯示 Before / After，必須確認才會執行。
  沒有任意 shell 執行；選取檔案內容及工具結果可能傳至 API。
- **Pet packs／外觀庫：** 只指現有 PNG 單圖裁切／程序動畫及等格 PNG sprite sheet + JSON 匯入。
  本機預覽、切換、刪除、還原預設；最多 8 個外觀，七種動畫狀態。
  沒有素材市場、ZIP 套件、AI 圖片生成或素材程式碼。
- **離線：** 外觀、設定、已有歷史和本機工具可用。Local tools (offline) 可直接操作
  行事曆、日記及檔案搜尋，仍需既有授權和逐次寫入確認。已設定 API 的聊天需網絡；
  略過 API 的 stub 是固定本機回應。
- **資料：** 設定中的 Export history 匯出聊天 JSON；Delete all chat history 需確認，
  只清除聊天與隔離的歷史資料，不清除行事曆、日記、外觀或授權。
  外觀可個別刪除；API 路由可移除並嘗試刪除其金鑰。沒有一鍵匯出／刪除整個應用程式資料功能。
  聊天、工具、備份及匯出不加密，邏輯刪除不是安全抹除。
- **手動更新：** 在 Settings 按 **Check for updates / 檢查更新** 才查詢 GitHub 正式版本
  metadata，不傳送聊天或金鑰。開啟版本頁後由使用者下載、校驗及安裝；不自動下載或安裝。

### 文件與 beta 驗證

- [使用者指南（zh-HK / English）](docs/user-guide.md)
- [安裝、SHA-256、移除](docs/install.md) · [已知問題及未測環境](docs/known-issues.md)
- [Beta 測試計劃與結果範本](docs/beta-test-plan.md) · [M5 歷史及 M7 安全審查](docs/security-notes.md)
- [v0.1.0 發行說明草稿](docs/release-notes-v0.1.0.md) · [發行說明範本](docs/release-notes-template.md)
- [CI／發行流程](docs/release-pipeline.md) · [效能基準](docs/performance.md)

真實 API key、真實 OS 金鑰庫、實體桌面、互動安裝／解除安裝、缺少 WebView2、FUSE 和
Wayland 均保留人工驗證；**NOT RUN / USER ACTION REQUIRED**，不可視作 CI 通過。

### 開發與測試

本次工作只在指定 Codex Cloud 環境及 CI runner 安裝 MIT／Apache 相容開發測試工具，
不用付費服務、不使用真實憑證，不在使用者桌面安裝任何東西，也不新增依賴。
需要 Node.js 22、pnpm 10.30.3、stable Rust；原生依賴見[安裝及建置](docs/install.md)與
[build workflow](.github/workflows/build.yml)。Linux CI 固定 **ubuntu-24.04**，Windows 使用 MSVC。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm test:release
cargo test --locked --manifest-path tools-core/Cargo.toml
pnpm test:tools
pnpm exec playwright install chromium
pnpm test:browser
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml
node scripts/check-secrets.mjs
```

`pnpm dev` 只預覽前端；`pnpm tauri dev` 才有原生功能。測試使用假憑證、mock IPC
和 loopback API；真實 keychain 測試只列作人工清單。Windows 安裝 smoke 及缺少卸載程式
P2 負面回歸只可在 CI runner 執行。CI 安裝包不等同完整實體桌面互動測試。
版本 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 均維持 `0.1.0`。

### 下一版本方向（規劃，未實作）

先由使用者完成 beta 人工驗證及審閱結果，再決定是否發佈 v0.1.0。
下一個 0.1.x 優先處理 beta 重現問題、Windows／Linux 桌面相容性及文件改善。
不承諾新增平台、簽章、本機模型、付費服務或自動更新；任何範圍變更須另行決定。

## English

DigiPet is an MIT-licensed desktop pet AI assistant built with Tauri v2, React,
TypeScript and Rust. **v0.1.0 is being prepared for beta; Windows x64 and Linux x64
only.** AI uses OpenAI-compatible APIs. No local models, model downloads, macOS or ARM64 builds.

**Unsigned / Unverified Publisher.** Verify the source and SHA-256 before installing.
Checksums establish byte integrity, not publisher identity. M7 prepares source,
documentation and CI artifacts only; it creates no tag or GitHub Release.
Outstanding manual checks must not be read as passed.

### First use

1. Follow the [install and SHA-256 guide](docs/install.md). Windows needs WebView2;
   Linux CI targets Ubuntu 24.04 x64 and requires WebKitGTK 4.1/GTK 3 and host libraries.
2. First launch opens the API wizard. Calendar and Journal use DigiPet-owned local
   JSON and default on for fresh installs and upgrades without an access prompt.
   Settings → Local tool access keeps per-tool on/off toggles; later off choices persist.
   File tools default denied until you select an allowed folder with the OS folder picker.
   **Skip for now / 暫時略過** keeps the
   local `(M0 stub) 收到：<text>` response. This is a fixed stub, with no model or provider call.
3. For API chat, enter the provider's **HTTPS base URL** (DigiPet appends
   `/chat/completions`), **model ID** and **API key**. Read and check **Cloud consent**,
   then **Save / 儲存**. Saving makes no connection test. Credentials go to Windows
   Credential Manager or Linux Secret Service; unavailable keychains never fall back to plaintext.
4. Type a message and press Enter or ↑. Recent messages, persona and tool results
   may reach consented providers and incur charges. **Stop** cancels locally;
   the provider may already have processed/billed the request.
5. Click the pet to toggle a lightweight speech bubble; Escape closes it. Normal
   closed mode shows only the pet on a transparent background. Hover for a compact
   Chat / Appearance / Settings wheel; leaving, Escape or an outside click dismisses it.
   Use the gear,
   right-click, or press `Ctrl+,` while focused to open the separate controls panel.
   **Settings** manages APIs, consent, preferences, data and tool permissions;
   Appearance, Conversations and Tools & state have their own controls. All appearance
   controls (selection, PNG upload, type, restore, delete and prompt tips) and all settings
   remain in this secondary surface, never inside the chat bubble.
   Never paste credentials into chat or issue reports.

See the [bilingual User Guide](docs/user-guide.md) for steps, data boundaries and troubleshooting.

### Implemented features and boundaries

- **Desktop:** drag the pet; `Ctrl+Shift+P` shows/hides, `Ctrl+Shift+I` toggles
  transparent-area click-through. Tray: Show / Hide, click-through, Quit.
  Windows/X11 restore position. Wayland disables automatic click-through, global
  shortcuts and position restoration. Tray, topmost, DPI, monitors and compositing need physical desktop checks.
- **API chat:** streaming, Stop, up to eight routes, per-endpoint consent; fallback
  is off by default. IndexedDB stores resumable conversations with delete/clear/JSON
  export. Stub conversations are not persisted.
- **Tools and permissions:** Calendar and Journal default on and can be turned off in
  Settings. Report, Coding and File Search default denied until an allowed folder is
  selected in Tool permissions; check AI tools in the controls panel → Tools & state. Every tool data write requires a
  Before / After preview and confirmation. No arbitrary shell execution. Selected
  file content and tool results may be sent to the API.
- **Pet packs / appearance library:** existing PNG crop/procedural animation or
  equal-cell PNG sprite sheet + JSON import only. Preview, select, delete or reset
  locally; at most eight appearances and seven animation states. No marketplace,
  ZIP packages, image generation or executable pack code.
- **Offline:** appearances, settings, existing history and local tools remain
  available. Local tools (offline) operates calendar, journal and file search with
  the same grants and write confirmations. Configured API chat needs network;
  skipping API setup keeps the fixed local stub.
- **Data:** Settings → Export history downloads chat JSON. Confirmed Delete all chat
  history clears conversations and quarantined history only, preserving calendar,
  journal, appearances and grants. Delete appearances individually; removing API
  routes attempts credential deletion. There is no application-wide export/delete
  button. Chat, tool data, backups and exports are unencrypted; deletion is logical, not secure erasure.
- **Manual updates:** Settings → **Check for updates** explicitly fetches stable
  GitHub release metadata without chat or credentials. The user opens the release
  page, downloads, verifies and installs. No automatic download or installation.

### Documentation and beta evidence

- [User Guide (zh-HK / English)](docs/user-guide.md)
- [Install, SHA-256 and uninstall](docs/install.md) · [Known issues and untested environments](docs/known-issues.md)
- [Beta test plan and results template](docs/beta-test-plan.md) · [M5 history and M7 security review](docs/security-notes.md)
- [v0.1.0 release notes draft](docs/release-notes-v0.1.0.md) · [Release notes template](docs/release-notes-template.md)
- [CI/release pipeline](docs/release-pipeline.md) · [Performance baseline](docs/performance.md)

Real API-key, real OS-keychain, physical desktop, interactive install/uninstall,
missing WebView2, FUSE and Wayland checks remain **NOT RUN / USER ACTION REQUIRED**.
CI success does not satisfy these manual checks.

### Development and tests

For this work, install MIT/Apache-compatible dev/test tools only in the designated
Codex Cloud environment and CI runners. No paid services, real credentials,
installs on user desktops or new dependencies. Use Node.js 22, pnpm 10.30.3 and
stable Rust; see [installation](docs/install.md) and the [build workflow](.github/workflows/build.yml)
for native requirements. Linux CI stays pinned to **ubuntu-24.04**; Windows uses MSVC.
Run the commands in the Chinese section above for the frontend, both Rust crates,
mock tool integration, browser flows, release integrity and credential-pattern checks.

`pnpm dev` previews only the frontend; `pnpm tauri dev` enables native features.
Tests use fake credentials, mock IPC and loopback providers. Real keychain checks
are manual only. Windows installer smoke and the P2 missing-uninstaller negative
regression are CI-runner-only. Packaged smoke does not prove full physical desktop
interaction. All three version files remain **0.1.0**.

### Next version (planned, not implemented)

Complete user-run beta validation and review results before deciding whether to
publish v0.1.0. The next 0.1.x should prioritize reproducible beta defects,
Windows/Linux desktop compatibility and documentation. Platform expansion,
signing, local models, paid services and automatic updates require separate decisions.

Architecture: [stack](docs/adr/0001-stack.md), [click-through](docs/adr/0002-click-through.md),
[appearance](docs/adr/0003-appearance.md), [credentials](docs/adr/0004-api-credentials.md),
[history/router](docs/adr/0005-chat-router-history.md), [tool permissions](docs/adr/0006-tool-permissions.md).
[MIT LICENSE](LICENSE).
