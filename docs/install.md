# Install, verify and uninstall / 安裝、校驗及移除

**Unsigned / Unverified Publisher — 未簽署／未驗證發行者。** DigiPet has no code
signing, notarization or ad-hoc signing. SHA-256 verifies bytes against a manifest,
not publisher identity. Use only a trusted source and matching manifest; a compromised
source could replace both. / DigiPet 沒有程式碼簽署、公證或 ad-hoc signing。
SHA-256 只核對檔案與清單是否一致，不能驗證發行者；請確認來源可信。

M6 adds packaging infrastructure, not a published release. The version remains
`0.1.0`; this work does not tag or publish it. Downloadable CI artifacts require
GitHub access and expire after 14 days. / M6 提供打包流程，不代表已發佈版本；版本仍為
`0.1.0`，本次不建立 tag 或公開發佈。CI artifacts 需登入 GitHub，並保留 14 日。

## Verify SHA-256 / 核對 SHA-256

Download and extract the artifact zip. Put the chosen installer and `SHA256SUMS`
from the **same run/release** in one directory. The combined artifact
`DigiPet-unsigned-windows-linux-x64` contains all three installers and one manifest.
下載並解壓 artifact zip，將同一 run／版本的安裝包及 `SHA256SUMS` 放在同一目錄。
合併 artifact 包含三個安裝包及一份清單。

Windows PowerShell (fail if the Windows entry is absent, duplicated or different):
Windows PowerShell（缺少、重複或不相符的 Windows 項目會失敗）：

```powershell
$name = 'DigiPet-Setup-windows-x64.exe'
$entries = @(Get-Content .\SHA256SUMS | Where-Object { $_ -match ('^[a-f0-9]{64}  ' + [regex]::Escape($name) + '$') })
if ($entries.Count -ne 1) { throw 'Missing/duplicate checksum entry' }
$expected = $entries[0].Substring(0, 64)
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $name).Hash.ToLowerInvariant() -ne $expected) { throw 'SHA-256 mismatch: do not install' }
'Verified'
```

Linux, with all installers present / Linux（已下載全部安裝包）：

```sh
sha256sum --check --strict SHA256SUMS
```

If downloading Linux files only, select both exact entries, require exactly two,
then verify them / 如只下載 Linux 檔案，先確認剛好有兩個對應項目，再校驗：

```sh
awk '$2 == "DigiPet-linux-x64.AppImage" || $2 == "DigiPet-linux-x64.deb"' SHA256SUMS > linux-SHA256SUMS
[ "$(wc -l < linux-SHA256SUMS)" -eq 2 ] && sha256sum --check --strict linux-SHA256SUMS
```

Every downloaded installer must say `OK`. On missing entries or any mismatch,
stop and obtain a fresh copy from a trusted source. / 所有已下載安裝包均須顯示 `OK`；
缺少項目或不相符時請停止，重新從可信來源下載。

## Windows x64

1. Verify `DigiPet-Setup-windows-x64.exe`, then run it. Only the current user is
   installed (normally `%LOCALAPPDATA%\DigiPet`); no Windows ARM64/macOS package.
   核對檔案後執行；僅安裝至目前帳戶，通常位於 `%LOCALAPPDATA%\DigiPet`。
2. Expect **SmartScreen** and **Unknown publisher / Unverified Publisher** warnings.
   Review the source and checksum before deciding whether to proceed; managed devices
   may block unsigned software. / 預期會出現 SmartScreen／未知發行者警告；請先核實來源及
   校驗碼，再決定是否繼續。受管理裝置可能禁止未簽署程式。
3. The Tauri NSIS installer checks for **Microsoft Edge WebView2 Runtime**. If missing,
   it downloads Microsoft's bootstrapper and prompts for runtime installation.
   Internet access is required; offline installation without an existing runtime
   cannot complete reliably. Provision the official [WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)
   separately on offline machines, then retry. / NSIS 會檢查 WebView2；缺少時透過 Tauri 下載
   Microsoft bootstrapper 並啟動安裝提示。離線電腦請先另行安裝官方 Evergreen Runtime。
4. Launch DigiPet from Start Menu. Skip API setup for offline local tools; no local
   model is downloaded. / 從開始功能表啟動；可略過 API 設定以使用離線本機工具，不下載本機模型。

To uninstall, quit via tray → Quit, then Settings → Apps → DigiPet → Uninstall.
**Delete app data** is an explicit optional checkbox; leave it unchecked to keep
settings, packs and history. Silent uninstall preserves data. WebView2 is shared
and is not removed. / 先從托盤退出，再於設定 → 應用程式解除安裝；**Delete app data** 為
自願勾選選項，不勾選及靜默移除均保留資料。共用 WebView2 不會被移除。

## Linux x64 (Ubuntu 24.04 baseline / 基準)

Use an X11 desktop session for intended pet behavior. Runtime packages include
GTK 3, WebKitGTK 4.1, X11, libxdo, AppIndicator and session D-Bus. A Secret Service
keychain is needed only for API credentials. / 建議使用 X11；需要 GTK 3、WebKitGTK 4.1、
X11、libxdo、AppIndicator 及 session D-Bus；儲存 API 憑證另需 Secret Service 金鑰庫。

After checksum verification / 校驗後：

```sh
sudo apt install ./DigiPet-linux-x64.deb
# Or / 或：
sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0t64 libxdo3 libx11-6 libayatana-appindicator3-1 librsvg2-2 dbus-x11
chmod +x DigiPet-linux-x64.AppImage
./DigiPet-linux-x64.AppImage
```

The deb declares its native library dependencies; `apt install` resolves them.
AppImage still needs host libraries. FUSE execution may require `libfuse2t64` on
Ubuntu 24.04; when FUSE is unavailable, use:
.deb 的依賴由 apt 處理；AppImage 仍需要主機系統函式庫。FUSE 可能需要 `libfuse2t64`；
無 FUSE 時可使用：

```sh
APPIMAGE_EXTRACT_AND_RUN=1 ./DigiPet-linux-x64.AppImage
```

Ubuntu 24.04 builds are not guaranteed on older glibc/WebKit distributions.
Wayland disables automatic click-through, global shortcuts and position persistence.
X11 transparency needs a compositor; GNOME trays may need an AppIndicator extension.
以 Ubuntu 24.04 打包不保證支援較舊 glibc／WebKit；Wayland 有穿透、快捷鍵及位置還原限制。

Quit before `sudo apt remove digipet`, or delete the AppImage. Neither operation
removes user data. / 先退出，再執行 `sudo apt remove digipet` 或刪除 AppImage；兩者均保留使用者資料。

## Data and manual updates / 資料及手動更新

Windows app data/config is under `%APPDATA%\io.github.ethan-cyf.digipet` and
`%LOCALAPPDATA%\io.github.ethan-cyf.digipet`. Linux uses
`${XDG_CONFIG_HOME:-~/.config}/io.github.ethan-cyf.digipet`,
`${XDG_DATA_HOME:-~/.local/share}/io.github.ethan-cyf.digipet` and WebKit data/cache
under the corresponding XDG directories. Back up before deliberately deleting any
application data. Webview storage contains appearance packs/settings/history;
`tools/` contains grants, calendar and journal. / 刪除資料前請先備份；WebView 儲存外觀、設定及
歷史，`tools/` 包含授權、日曆及日誌。

To remove API credentials, disable API/remove routes in Settings while the OS
keychain is unlocked **before uninstalling**. Uninstalling/clearing app data does
not guarantee keychain erasure. Exported files in user-chosen folders are never
removed by uninstall. / 請在移除程式前解鎖金鑰庫，於設定停用 API／移除路由；解除安裝或
刪除程式資料不保證清除金鑰庫。使用者匯出的檔案不會由移除程式刪除。

Once per native app startup, DigiPet checks GitHub's latest published, non-draft,
non-prerelease release metadata (5-second limit). Only a newer SemVer produces a
notice inside chat. Opening the link is explicit; download, checksum verification
and installation are manual. There are no automatic asset downloads, installs,
background polling or updater service. No release/offline/errors remain silent.
This anonymous GitHub metadata request sends no API keys, chats or local files.
原生程式每次啟動只查詢一次 GitHub 最新已公開正式版本（最多 5 秒）；僅較新的 SemVer
會在聊天內顯示提示。只有按連結才開啟版本頁面；下載、核對 SHA-256 及安裝均由使用者手動
進行。沒有自動下載、安裝或背景輪詢；查詢不傳送 API key、對話或本機檔案。

See [known issues](known-issues.md) and [release pipeline](release-pipeline.md).
