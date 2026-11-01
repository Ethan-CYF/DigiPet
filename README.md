# DigiPet

[繁體中文](#繁體中文) · [English](#english)

## 繁體中文

DigiPet 是 MIT 授權的開源桌面寵物 AI 助理，使用 **Tauri v2 + React + TypeScript（Vite）+ Rust + pnpm**。目標平台為 **Windows 與 Linux**。M1 延續 M0 桌面核心，加入七種動畫狀態、本機外觀庫、單圖裁切與程序動作、等格 PNG sprite sheet，以及位置與外觀還原。保留透明置頂、拖曳、stub 聊天、穿透、托盤與快捷鍵。

M1 動畫與外觀已完成。**M2 加入首次啟動／設定精靈、安全憑證與 API 聊天**，支援 OpenAI 相容 API（例如 DeepSeek）。不整合 llama.cpp、Ollama 或本機模型下載。未設定或選擇略過時，傳送訊息仍只顯示本機 `(M0 stub) 收到：<text>`；不儲存對話。

### 開發與執行

需要 Node.js 22 LTS、pnpm 10（`packageManager` 指定版本）、最新 stable Rust（含 Cargo），以及平台原生開發套件。可用 Corepack 或 `npm install -g pnpm@10.30.3` 安裝 pnpm。

Windows：安裝 **Visual Studio 2022 Build Tools** 的「Desktop development with C++」與 Windows SDK，以及 **Microsoft Edge WebView2 Runtime**。使用 MSVC Rust toolchain。

Linux（Ubuntu 24.04 / Debian 12+）：

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config curl file \
  libwebkit2gtk-4.1-dev libxdo-dev libx11-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf libdbus-1-dev
```

```sh
pnpm i
pnpm tauri dev
```

其他指令：

```sh
pnpm build                         # TypeScript + Vite 前端
pnpm test                          # 互動／狀態／素材驗證／alpha 命中測試
pnpm exec playwright install chromium
pnpm test:browser                  # 瀏覽器外觀匯入／重新載入 smoke
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build                   # 未簽章平台安裝包
```

Linux 會產生 `.deb` 與 `.AppImage`；Windows 會產生 NSIS 安裝程式，位於 `src-tauri/target/release/bundle/`。沒有 macOS 目標、簽章或自動發布流程。若 Linux 容器沒有 FUSE，可用 `APPIMAGE_EXTRACT_AND_RUN=1 pnpm tauri build` 打包。`pnpm dev` 僅可預覽前端，沒有原生拖曳、穿透、托盤及快捷鍵。

### 操作與平台限制

- 單擊寵物：開啟／關閉上方聊天泡泡。輸入後按 Enter 或 ↑ 傳送，Esc 關閉。聚焦寵物時可用 Enter／空白鍵切換。
- 按住左鍵拖曳：移動寵物。移動超過 5 個邏輯像素後不會觸發聊天。Windows／X11 會從 mousedown 啟動 `startDragging`，原生按鍵偵測處理系統吞掉 mouseup 的情況。Wayland 採 DOM 移動門檻後啟動拖曳。
- `Ctrl+Shift+P`：顯示／隱藏。`Ctrl+Shift+I`：切換透明區域穿透。托盤提供 **Show / Hide**、穿透開關、**Quit**。
- 閒置視窗為 200×200；聊天 200×400；外觀管理 360×640 邏輯像素。展開時保持寵物位置；若超出螢幕，會盡力移回最近螢幕（完整螢幕邊界，非工作區）。Windows／X11 於移動停止 500ms 後與托盤 Quit 時保存實體座標與底部錨點至應用程式設定目錄 `position-v1.txt`，重啟時還原並處理螢幕移除／負座標；DPI 與視窗管理器仍可能影響結果。
- Windows：透明、置頂、隱藏工作列及透明區域穿透由原生 API 處理，仍需在實際桌面驗證多螢幕／縮放。**未簽章**安裝程式可能觸發 SmartScreen；確認來源後選 **More info（其他資訊）→ Run anyway（仍要執行）**。
- Linux X11：需合成管理器才能正確顯示透明；置頂／隱藏工作列由視窗管理器決定。命中測試使用全域游標與不透明像素範圍，每 40ms 更新原生 `setIgnoreCursorEvents` 等效 Rust API，最多可能有一個取樣週期的切換延遲。可隨時以托盤／快捷鍵停用。
- Linux Wayland：保守停用自動穿透與全域快捷鍵，不保存／還原視窗位置，因全域游標、定位、置頂、工作列提示及全域快捷鍵受 compositor 限制，無法保證。可選擇 X11 工作階段以使用完整功能；XWayland 也不保證。托盤需桌面提供 AppIndicator／StatusNotifier 支援（GNOME 可能需擴充套件）。快捷鍵若被佔用或無法註冊，程式會記錄錯誤並繼續啟動，請使用托盤。

### M2 API 設定與隱私

首次啟動會開啟精靈；之後可點寵物 → **Settings / 設定**。輸入 HTTPS base URL（例如 `https://api.deepseek.com/v1`，程式會附加 `/chat/completions`）、模型 ID（例如 `deepseek-chat`）及 API key。勾選雲端同意後才可儲存。儲存不會測試連線或送出訊息；傳送聊天時才會把單則文字、模型 ID 與驗證金鑰送到所選供應商，可能產生費用並適用其隱私政策。按 **Stop / 停止** 取消本機請求；供應商可能已處理／計費。

金鑰透過 MIT/Apache-2.0 相容的 Rust `keyring` 存於 Windows Credential Manager 或 Linux Secret Service；Linux 需要已解鎖的桌面金鑰庫（如 GNOME Keyring/KWallet Secret Service）與 session D-Bus。不可用時不會降級成明文儲存，可解鎖後重試或略過。webview localStorage 只保存完成狀態、同意、端點、模型及隨機 `credentialRef`。重啟後會還原；API key 不會回填至 UI。修改設定需重新輸入金鑰與同意。略過會停用 API，並嘗試刪除上一個金鑰；金鑰庫鎖定時可能需在 OS 金鑰庫手動清除舊項目。

**Skip for now / 暫時略過** 保留 stub，不連網。只支援非串流單則聊天；不傳送歷史對話、不保存聊天。前端預覽沒有 OS 金鑰庫，無法保存真實 API 設定；使用 `pnpm tauri dev` 驗證原生流程。CI 只用假憑證與 loopback 假服務，不呼叫付費 API。設定精靈與外觀管理皆使用 360×640 視窗。

### M1 外觀與動畫

點擊寵物後使用「Appearance / 外觀」。外觀庫支援匯入、預覽、切換、刪除與還原預設，最多 8 個；資料儲存在此應用程式 webview 的 localStorage，重啟會還原選取外觀。儲存空間滿／被停用時會顯示錯誤且保留原設定。損壞圖片回退預設寵物。刪除只影響本機副本，不會修改來源檔案。

- **單圖**：選擇 PNG，以原圖像素輸入 x、y、width、height 裁切，檢查原圖與動畫預覽，再儲存並套用。裁切後最長邊縮至 256。只有呼吸、浮動、跳動、縮放等程序動作，沒有 AI 去背或生成影格。
- **Sprite sheet**：先選 PNG，再切換類型；選取 JSON 或編輯設定。只接受等格 PNG、由左至右再由上至下且從 0 起算的影格索引、1–30 FPS 與下列七狀態。未指定或空白的非 idle 狀態影格回退 `idle`；不添加額外狀態。
- **七狀態**：`idle`、`walk`、`happy`、`thinking`、`talking`、`sleep`、`sad`。泡泡中的 State 選單可直接觸發每種狀態。拖曳使用 walk → idle；stub 訊息使用 thinking → talking → idle。手動切換會取消待執行的 stub 狀態轉換。系統偏好減少動態時，單圖停止週期動作（sheet 仍依 FPS 播放）。
- **上傳提示**：單一置中角色、透明背景、周圍留白、無文字。UI 的 prompt tips 僅為準備圖片的文字建議，不呼叫任何生成服務。
- **資料格式與安全界線**：PNG ≤ 2 MiB、每邊 ≤ 2048；JSON ≤ 32 KiB、每邊最多 32 格、總共 ≤ 256 格、每狀態 ≤ 256 影格。拒絕未知欄位、額外狀態、非法索引、非等格、APNG、SVG、URL、路徑及可執行欄位。不解壓素材、不執行素材程式碼，也不從設定讀檔。只透過使用者選取的檔案讀取 PNG／JSON；Rust 不接收素材或來源路徑。穿透每 100ms 依目前繪製的 128×128 Canvas alpha（>8/255）更新，保留透明洞與動作，不重用 M0 固定 16×16 遮罩。

```json
{"version":1,"columns":2,"rows":1,"fps":8,"states":{"idle":[0],"walk":[0,1],"happy":[1,0],"thinking":[0],"talking":[0,1],"sleep":[0],"sad":[1]}}
```

### 路線圖（後續列為規劃）

| 里程碑 | 範圍 |
| --- | --- |
| M0 | 桌面視窗、像素寵物動畫、拖曳、stub 聊天、穿透、托盤、CI |
| M1（完成） | 桌寵動畫與外觀：七狀態、單圖裁切／程序動作、sprite sheet、本機外觀管理、位置還原 |
| M2（本次） | API 設定精靈、雲端同意、安全憑證、API router 與可停止的聊天；不下載模型 |
| M3 | API 體驗改善：串流、連線診斷與供應商相容性 |
| M4 | 可選工具與使用者授權的助理動作 |
| M5 | 可控的記憶、設定與隱私選項 |
| M6 | Windows／Linux 相容性、效能、無障礙與測試 |
| M7 | 穩定版本、文件、發行與社群貢獻流程 |

架構決策：[0001-stack](docs/adr/0001-stack.md)、[0002-click-through](docs/adr/0002-click-through.md)、[0003-appearance](docs/adr/0003-appearance.md)、[0004-api-credentials](docs/adr/0004-api-credentials.md)。原有 [MIT LICENSE](LICENSE) 保留不變。

## English

DigiPet is an **MIT-licensed open-source desktop pet AI assistant**, built with **Tauri v2, React, TypeScript, Vite, Rust and pnpm**, targeting **Windows and Linux only**. M1 extends the M0 desktop shell with seven animation states, a local appearance library, cropped single-image procedural motion, equal-cell PNG sprite sheets, and appearance/position restoration. Transparency, topmost, dragging, stub chat, click-through, tray and shortcuts remain available.

M1 animation and appearance are complete. **M2 adds the first-run/settings wizard, secure credentials and API chat** through OpenAI-compatible endpoints such as DeepSeek. No llama.cpp, Ollama or local model downloads. When skipped or unset, chat still produces `(M0 stub) 收到：<text>` locally. Conversations are not persisted.

### Develop and build

Install Node.js 22 LTS, pnpm 10 (version pinned in `packageManager`), current stable Rust/Cargo and native prerequisites. Install pnpm using Corepack or `npm install -g pnpm@10.30.3`.

On Windows, install **Visual Studio 2022 Build Tools → Desktop development with C++**, a Windows SDK, the MSVC Rust toolchain and **Microsoft Edge WebView2 Runtime**.

On Ubuntu 24.04 / Debian 12+:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config curl file \
  libwebkit2gtk-4.1-dev libxdo-dev libx11-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf libdbus-1-dev
```

```sh
pnpm i
pnpm tauri dev
```

Checks and packaging:

```sh
pnpm build
pnpm test
pnpm exec playwright install chromium
pnpm test:browser
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Unsigned installers appear under `src-tauri/target/release/bundle/`: `.deb` and `.AppImage` on Linux; NSIS on Windows. There is no macOS target, signing or automatic release publishing. In Linux containers without FUSE, use `APPIMAGE_EXTRACT_AND_RUN=1 pnpm tauri build`. `pnpm dev` previews the frontend in a browser without native desktop features.

### Controls and limitations

- Click the pet to toggle its chat bubble. Enter or ↑ sends; Esc closes. Enter/Space on the focused pet also toggles chat.
- Hold the left mouse button to drag. Movement over five logical pixels suppresses click. Windows/X11 call `startDragging` from mousedown; native button monitoring handles mouseup consumed by the OS move loop. Wayland falls back to dragging after a DOM movement threshold.
- **Ctrl+Shift+P** toggles visibility. **Ctrl+Shift+I** toggles transparent-area click-through. Tray menu: **Show / Hide**, click-through checkbox, **Quit**.
- The idle window is 200×200 logical pixels, chat 200×400, appearance manager 360×640. Expansion preserves the pet anchor where possible; overflow is clamped to the nearest full monitor bounds (not the work area). Windows/X11 save physical left/bottom coordinates to the application config directory (`position-v1.txt`) after 500ms without movement and on tray Quit. Restart restores them and recovers from removed monitors/negative origins. DPI and window-manager behavior remain best effort.
- **Windows:** native transparency, always-on-top, skip-taskbar and cursor ignore; multi-monitor/DPI behavior still needs real-desktop testing. Unsigned installers can trigger **SmartScreen**. After verifying the source, choose **More info → Run anyway**.
- **Linux X11:** transparency requires compositing. The window manager controls topmost/taskbar hints. The backend polls global cursor position every 40ms and applies `set_ignore_cursor_events` (the Rust equivalent of `setIgnoreCursorEvents`) against opaque sprite row runs and the bubble. There may be up to one polling interval of transition latency. Disable through the tray/hotkey if needed.
- **Linux Wayland:** automatic click-through, global shortcuts and position persistence are disabled. Compositor policy restricts global cursor access, positioning, topmost/taskbar hints and global shortcuts. Use an X11 session for the intended behavior; XWayland is not guaranteed. Trays need AppIndicator/StatusNotifier support; GNOME may require an extension. Shortcut registration conflicts/errors are logged without aborting startup; use the tray instead.

### M2 API setup and privacy

First launch opens the wizard; reopen it via the pet → **Settings / 設定**. Enter an HTTPS base URL (e.g. `https://api.deepseek.com/v1`; the app appends `/chat/completions`), model ID (e.g. `deepseek-chat`) and API key. Explicit cloud consent enables Save. Saving makes no network request. Sending chat transmits the single message, model ID and authentication key to the chosen provider; its fees and privacy policy apply. **Stop / 停止** cancels the local request; the provider may already have processed/billed it.

Rust `keyring` (MIT/Apache-2.0 compatible) stores credentials in Windows Credential Manager or Linux Secret Service. Linux needs an unlocked desktop keychain (e.g. GNOME Keyring/KWallet Secret Service) and session D-Bus. Failure never falls back to plaintext; unlock and retry or skip. Webview localStorage holds only completion, consent, endpoint, model and random `credentialRef`, restored on restart. Keys are never returned to the UI. Editing requires re-entering the key and consent. Skip disables API and attempts to delete the previous key; if the keychain is locked, orphan entries may need removal in the OS keychain.

**Skip for now / 暫時略過** keeps chat local and stubbed. M2 uses non-streaming, single-message chat; no conversation history is sent or persisted. Browser preview has no OS keychain and cannot save real API settings; use `pnpm tauri dev` for the native flow. CI uses fake credentials and loopback test servers, never paid APIs. Wizard and appearance manager use the 360×640 window.

### M1 appearance and animation

Click the pet, then **Appearance / 外觀**. Import, preview, switch, delete or restore default locally, with up to eight appearances. The webview localStorage holds the library and selection across restarts. Full or disabled storage reports an error and preserves the previous setting. Bad images fall back to the default pet. Deletion removes only the local copy, leaving source files intact.

- **Single image:** choose PNG, edit x/y/width/height in original pixels, check source and animated crop previews, then save and apply. Crops are reduced to at most 256 pixels on the longest edge. Breathing, floating, hopping and scaling are procedural; no AI cutout or generated frames.
- **Sprite sheet:** choose PNG, switch type, then choose JSON or edit its data. Only equal cells, zero-based row-major frame order, 1–30 FPS and the seven states below are supported. Missing or empty non-idle state frames fall back to `idle`; no additional states are introduced.
- **Exactly seven states:** `idle`, `walk`, `happy`, `thinking`, `talking`, `sleep`, `sad`. The bubble's State selector triggers each one. Dragging uses walk → idle; stub replies use thinking → talking → idle. Manual state selection cancels pending stub transitions. Reduced-motion preference stops periodic single-image motion; sheets still play at their configured FPS.
- **Prompt tips:** one centered character, transparent background, padding, no text. These are preparation suggestions only; the app does not generate images.
- **Format/security limits:** PNG ≤ 2 MiB, each edge ≤ 2048; JSON ≤ 32 KiB, grid axes ≤ 32 cells, total ≤ 256 cells, ≤ 256 frames per state. Unknown fields, extra states, invalid indices, unequal cells, APNG, SVG, URLs, paths and executable fields are rejected. No archive extraction, pack code execution or file references. Only explicitly selected PNG/JSON files are read; Rust never receives pack contents or source paths. Click-through samples the actual rendered 128×128 Canvas alpha (>8/255) every 100ms, including holes and current motion, instead of reusing M0's fixed 16×16 mask.

```json
{"version":1,"columns":2,"rows":1,"fps":8,"states":{"idle":[0],"walk":[0,1],"happy":[1,0],"thinking":[0],"talking":[0,1],"sleep":[0],"sad":[1]}}
```

### Roadmap (later milestones planned)

| Milestone | Scope |
| --- | --- |
| M0 | Desktop shell, pet animation, drag, stub chat, click-through, tray, CI |
| M1 (done) | Pet animation and appearance: seven states, single-image crop/procedural motion, sprite sheets, local library, position restore |
| M2 (this change) | API setup wizard, cloud consent, secure credentials, API router and cancellable chat; no model downloads |
| M3 | API experience: streaming, connection diagnostics and provider compatibility |
| M4 | Optional tools and user-authorized assistant actions |
| M5 | User-controlled memory, preferences and privacy |
| M6 | Windows/Linux compatibility, performance, accessibility and testing |
| M7 | Stable release, docs, distribution and contribution workflow |

See [ADR 0001](docs/adr/0001-stack.md) and [ADR 0002](docs/adr/0002-click-through.md), and [ADR 0003](docs/adr/0003-appearance.md), and [ADR 0004](docs/adr/0004-api-credentials.md). The existing [MIT LICENSE](LICENSE) is unchanged.
