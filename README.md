# DigiPet

[繁體中文](#繁體中文) · [English](#english)

## 繁體中文

DigiPet 是 MIT 授權的開源桌面寵物 AI 助理，使用 **Tauri v2 + React + TypeScript（Vite）+ Rust + pnpm**。目標平台為 **Windows 與 Linux**。M0 是概念驗證：紫色像素寵物會呼吸／輕跳，可拖曳、點擊聊天，並提供系統匣（托盤）及全域快捷鍵。

**M0 沒有 LLM、API 呼叫、模型下載或圖片上傳。** 傳送訊息只會在本機顯示 `(M0 stub) 收到：<text>`，不儲存對話。`src/modules/` 內的 ai-router、model-wizard、pet-upload 僅定義未來介面；OpenAI 相容服務（例如 DeepSeek）與本地模型尚未接線。

### 開發與執行

需要 Node.js 22 LTS、pnpm 10（`packageManager` 指定版本）、最新 stable Rust（含 Cargo），以及平台原生開發套件。可用 Corepack 或 `npm install -g pnpm@10.30.3` 安裝 pnpm。

Windows：安裝 **Visual Studio 2022 Build Tools** 的「Desktop development with C++」與 Windows SDK，以及 **Microsoft Edge WebView2 Runtime**。使用 MSVC Rust toolchain。

Linux（Ubuntu 24.04 / Debian 12+）：

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config curl file \
  libwebkit2gtk-4.1-dev libxdo-dev libx11-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf
```

```sh
pnpm i
pnpm tauri dev
```

其他指令：

```sh
pnpm build                         # TypeScript + Vite 前端
pnpm test                          # 互動／像素命中測試
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build                   # 未簽章平台安裝包
```

Linux 會產生 `.deb` 與 `.AppImage`；Windows 會產生 NSIS 安裝程式，位於 `src-tauri/target/release/bundle/`。沒有 macOS 目標、簽章或自動發布流程。若 Linux 容器沒有 FUSE，可用 `APPIMAGE_EXTRACT_AND_RUN=1 pnpm tauri build` 打包。`pnpm dev` 僅可預覽前端，沒有原生拖曳、穿透、托盤及快捷鍵。

### 操作與平台限制

- 單擊寵物：開啟／關閉上方聊天泡泡。輸入後按 Enter 或 ↑ 傳送，Esc 關閉。聚焦寵物時可用 Enter／空白鍵切換。
- 按住左鍵拖曳：移動寵物。移動超過 5 個邏輯像素後不會觸發聊天。Windows／X11 會從 mousedown 啟動 `startDragging`，原生按鍵偵測處理系統吞掉 mouseup 的情況。Wayland 採 DOM 移動門檻後啟動拖曳。
- `Ctrl+Shift+P`：顯示／隱藏。`Ctrl+Shift+I`：切換透明區域穿透。托盤提供 **Show / Hide**、穿透開關、**Quit**。
- 閒置視窗為 200×200 邏輯像素；聊天時向上展開至 200×400，寵物位置不變。靠近螢幕上緣時，請先拖曳至較低位置再開啟聊天。
- Windows：透明、置頂、隱藏工作列及透明區域穿透由原生 API 處理，仍需在實際桌面驗證多螢幕／縮放。**未簽章**安裝程式可能觸發 SmartScreen；確認來源後選 **More info（其他資訊）→ Run anyway（仍要執行）**。
- Linux X11：需合成管理器才能正確顯示透明；置頂／隱藏工作列由視窗管理器決定。命中測試使用全域游標與不透明像素範圍，每 40ms 更新原生 `setIgnoreCursorEvents` 等效 Rust API，最多可能有一個取樣週期的切換延遲。可隨時以托盤／快捷鍵停用。
- Linux Wayland：M0 保守停用自動穿透與全域快捷鍵，因全域游標、定位、置頂、工作列提示及全域快捷鍵受 compositor 限制，無法保證。可選擇 X11 工作階段以使用完整功能；XWayland 也不保證。托盤需桌面提供 AppIndicator／StatusNotifier 支援（GNOME 可能需擴充套件）。快捷鍵若被佔用或無法註冊，程式會記錄錯誤並繼續啟動，請使用托盤。

### 路線圖（規劃，非已完成功能）

| 里程碑 | 範圍 |
| --- | --- |
| M0 | 桌面視窗、像素寵物動畫、拖曳、stub 聊天、穿透、托盤、CI |
| M1 | AI router：本地模型與 OpenAI 相容 API（如 DeepSeek） |
| M2 | 模型精靈、硬體偵測、明確同意後下載模型 |
| M3 | 寵物上傳、裁切、自動動畫與素材管理 |
| M4 | 可選工具與使用者授權的助理動作 |
| M5 | 可控的記憶、設定與隱私選項 |
| M6 | Windows／Linux 相容性、效能、無障礙與測試 |
| M7 | 穩定版本、文件、發行與社群貢獻流程 |

架構決策：[0001-stack](docs/adr/0001-stack.md)、[0002-click-through](docs/adr/0002-click-through.md)。原有 [MIT LICENSE](LICENSE) 保留不變。

## English

DigiPet is an **MIT-licensed open-source desktop pet AI assistant**, built with **Tauri v2, React, TypeScript, Vite, Rust and pnpm**, targeting **Windows and Linux only**. M0 is a proof of concept: an animated pixel pet, dragging, click-to-chat, transparent-area click-through, tray controls and global shortcuts.

**M0 has no LLM, remote API calls, model downloads or image uploads.** Sending a message produces only `(M0 stub) 收到：<text>` locally. Conversations are not persisted. `src/modules/ai-router.ts`, `model-wizard.ts` and `pet-upload.ts` define future interfaces only, including local and OpenAI-compatible routes such as DeepSeek.

### Develop and build

Install Node.js 22 LTS, pnpm 10 (version pinned in `packageManager`), current stable Rust/Cargo and native prerequisites. Install pnpm using Corepack or `npm install -g pnpm@10.30.3`.

On Windows, install **Visual Studio 2022 Build Tools → Desktop development with C++**, a Windows SDK, the MSVC Rust toolchain and **Microsoft Edge WebView2 Runtime**.

On Ubuntu 24.04 / Debian 12+:

```sh
sudo apt-get update
sudo apt-get install -y build-essential pkg-config curl file \
  libwebkit2gtk-4.1-dev libxdo-dev libx11-dev \
  libayatana-appindicator3-dev librsvg2-dev patchelf
```

```sh
pnpm i
pnpm tauri dev
```

Checks and packaging:

```sh
pnpm build
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
pnpm tauri build
```

Unsigned installers appear under `src-tauri/target/release/bundle/`: `.deb` and `.AppImage` on Linux; NSIS on Windows. There is no macOS target, signing or automatic release publishing. In Linux containers without FUSE, use `APPIMAGE_EXTRACT_AND_RUN=1 pnpm tauri build`. `pnpm dev` previews the frontend in a browser without native desktop features.

### Controls and limitations

- Click the pet to toggle its chat bubble. Enter or ↑ sends; Esc closes. Enter/Space on the focused pet also toggles chat.
- Hold the left mouse button to drag. Movement over five logical pixels suppresses click. Windows/X11 call `startDragging` from mousedown; native button monitoring handles mouseup consumed by the OS move loop. Wayland falls back to dragging after a DOM movement threshold.
- **Ctrl+Shift+P** toggles visibility. **Ctrl+Shift+I** toggles transparent-area click-through. Tray menu: **Show / Hide**, click-through checkbox, **Quit**.
- The idle window is 200×200 logical pixels. Chat expands it upward to 200×400 while keeping the pet anchored. Move the pet lower before opening chat near the top screen edge.
- **Windows:** native transparency, always-on-top, skip-taskbar and cursor ignore; multi-monitor/DPI behavior still needs real-desktop testing. Unsigned installers can trigger **SmartScreen**. After verifying the source, choose **More info → Run anyway**.
- **Linux X11:** transparency requires compositing. The window manager controls topmost/taskbar hints. The backend polls global cursor position every 40ms and applies `set_ignore_cursor_events` (the Rust equivalent of `setIgnoreCursorEvents`) against opaque sprite row runs and the bubble. There may be up to one polling interval of transition latency. Disable through the tray/hotkey if needed.
- **Linux Wayland:** automatic click-through and global shortcuts are disabled in M0. Compositor policy restricts global cursor access, positioning, topmost/taskbar hints and global shortcuts. Use an X11 session for the intended behavior; XWayland is not guaranteed. Trays need AppIndicator/StatusNotifier support; GNOME may require an extension. Shortcut registration conflicts/errors are logged without aborting startup; use the tray instead.

### Roadmap (planned)

| Milestone | Scope |
| --- | --- |
| M0 | Desktop shell, pet animation, drag, stub chat, click-through, tray, CI |
| M1 | AI router: local models and OpenAI-compatible APIs, e.g. DeepSeek |
| M2 | Model wizard, hardware discovery, consent-based model downloads |
| M3 | Pet upload, crop, auto-animation and asset library |
| M4 | Optional tools and user-authorized assistant actions |
| M5 | User-controlled memory, preferences and privacy |
| M6 | Windows/Linux compatibility, performance, accessibility and testing |
| M7 | Stable release, docs, distribution and contribution workflow |

See [ADR 0001](docs/adr/0001-stack.md) and [ADR 0002](docs/adr/0002-click-through.md). The existing [MIT LICENSE](LICENSE) is unchanged.
