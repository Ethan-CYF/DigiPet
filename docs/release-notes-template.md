# DigiPet {{VERSION}} — Unsigned / Unverified Publisher

> **Unsigned / Unverified Publisher — 未簽署／未驗證發行者。**
> No code signing, notarization or ad-hoc signing. SHA-256 detects changes to the
> downloaded bytes; it does not authenticate a publisher. / 沒有程式碼簽署、公證或
> ad-hoc signing。SHA-256 可偵測下載檔案的變更，不能驗證發行者身份。

Source / 原始碼 commit: `{{SOURCE_SHA}}`

This is a **Draft** for maintainer review. This workflow never publishes releases
or creates tags. / 這是供維護者審閱的 **Draft**；流程不會公開發佈或建立 tag。
Replace these template notes and attach actual CI evidence before any later,
separately authorized publication. / 日後若另行授權公開發佈，請先填寫實際變更及 CI 證據。

## Changes / 變更

- [Fill in user-visible changes / 填寫使用者可見變更]
- Windows x64 NSIS; Linux x64 AppImage **and** `.deb`, built on ubuntu-24.04.
- API-only OpenAI-compatible AI; no local models. No automatic download/install of updates.
- 僅 Windows x64 和 Linux x64；AI 僅支援 OpenAI-compatible API，沒有本機模型或自動安裝更新。

## Downloads and integrity / 下載與完整性

| File / 檔案 | Purpose / 用途 |
| --- | --- |
| `DigiPet-Setup-windows-x64.exe` | Per-user Windows NSIS installer / 個人帳戶安裝程式 |
| `DigiPet-linux-x64.AppImage` | Linux portable executable / Linux 可攜執行檔 |
| `DigiPet-linux-x64.deb` | Debian/Ubuntu package / Debian/Ubuntu 套件 |
| `SHA256SUMS` | SHA-256 for **all three** installers / 包含全部三個安裝包的 SHA-256 |

Download the installer and `SHA256SUMS` from the same trusted workflow run or
release. Verify before installing; see [install and verification guide](https://github.com/Ethan-CYF/DigiPet/blob/main/docs/install.md).
請從同一個可信 workflow run 或版本下載安裝包及 `SHA256SUMS`，並在安裝前核對。

## Warnings and limitations / 警告與限制

- **Windows:** SmartScreen and **Unknown publisher / Unverified Publisher** warnings
  are expected. Per-user install. Missing WebView2 triggers Tauri's Microsoft runtime
  bootstrapper; network is required. Offline without WebView2 is unsupported until
  the official runtime is installed. / Windows 預期出現 SmartScreen 及未知發行者警告。
  缺少 WebView2 時會透過 Tauri 啟動 Microsoft 安裝程式；需連線，不能假設離線環境已有 runtime。
- **Linux:** requires WebKitGTK 4.1 / GTK 3 and desktop runtime dependencies. Ubuntu
  24.04 x64 is the CI baseline; newer glibc builds may not run on older distributions.
  AppImage does not bundle every system library. / Linux 需要 WebKitGTK 4.1／GTK 3 等
  系統依賴；以 Ubuntu 24.04 x64 為 CI 基準，不保證舊版發行版相容。
- **Desktop integration:** X11 compositing and tray support vary; Wayland lacks
  automatic click-through, global shortcuts and saved position. / X11 合成及托盤支援
  視桌面而定；Wayland 不支援自動穿透、全域快捷鍵及位置儲存。
- Updates only check published stable GitHub release metadata and offer a manual
  download link; offline/no release/errors are silent. / 更新只查詢已公開的正式版本資訊，
  提供手動下載連結；離線、無版本或失敗時不作提示。
- [Known issues / 已知問題](https://github.com/Ethan-CYF/DigiPet/blob/main/docs/known-issues.md)

## Validation / 驗證

Attach the matching workflow run URL and smoke artifacts. / 請附上對應 workflow run 連結及 smoke artifacts。
CI re-downloads and verifies workflow artifacts and, for tag runs, Draft assets.
Windows checks silent install/native window/uninstall and CI data preservation;
Linux checks deb install, Xvfb/X11 window launch, AppImage extract-and-run and deb removal.
CI 會重新下載並校驗 artifacts（tag run 另包含 Draft assets），以及測試安裝、原生視窗啟動、
移除和保留 CI 測試資料。

**Not covered / 未涵蓋：** interactive installer/uninstaller including delete-data opt-in,
SmartScreen, offline/missing WebView2, AppImage FUSE mounting, full packaged webview
interaction, real desktops, DPI/tray/compositor integration and Wayland.
互動安裝／移除（包括勾選刪除資料）、SmartScreen、缺少或離線 WebView2、FUSE、完整套件
WebView 互動、實體桌面及 Wayland 均需額外驗證。

## Uninstall / 移除

Quit DigiPet first. Windows: Settings → Apps → DigiPet → Uninstall; leave
**Delete app data** unchecked to keep packs/history/settings. Linux:
`sudo apt remove digi-pet`, or delete the AppImage. User data stays unless explicitly
removed. Keychain entries and tool-exported files require separate user action.
先退出 DigiPet。Windows：設定 → 應用程式 → DigiPet → 解除安裝；不要勾選 **Delete app data**
即可保留外觀、歷史及設定。Linux：`sudo apt remove digi-pet` 或刪除 AppImage。
金鑰庫項目及匯出的工具檔案需另行處理；詳見安裝指引。
