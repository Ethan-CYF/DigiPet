# Known issues / 已知問題

- **Unsigned / Unverified Publisher.** SmartScreen/unknown publisher warnings and
  enterprise policy blocks are expected; SHA-256 is integrity, not identity.
  未簽署／未驗證發行者；SmartScreen、未知發行者警告及企業封鎖屬預期情況。
- Windows requires WebView2. Missing runtime uses Tauri's download-and-prompt path,
  which needs Internet; missing/offline WebView2 and interactive installer prompts
  are not covered by CI. / Windows 需要 WebView2；下載安裝需連線，CI 未驗證離線／缺少 runtime 及互動提示。
- Linux builds target Ubuntu 24.04 x64's runtime baseline. AppImage is not fully
  self-contained; WebKitGTK 4.1/GTK 3 and other host libraries are required. Older
  glibc distributions may fail. FUSE mounting is not covered; CI uses extract-and-run.
  Linux 以 Ubuntu 24.04 為基準，仍需系統函式庫；不保證舊版發行版，CI 未驗證 FUSE 掛載。
- Wayland has no automatic click-through, global shortcuts or saved position.
  X11 needs compositing; trays, shortcuts, topmost and multi-monitor/DPI vary by
  desktop. Real desktop validation remains outstanding. / Wayland 功能有限；X11 合成、
  托盤、置頂、多螢幕及 DPI 仍需實體桌面測試。
- Packaged native smoke checks prove a window appears and the process stays alive,
  not complete webview interaction. Interactive uninstall/delete-data opt-in is
  untested; silent uninstall preserves disposable CI sentinels. / 原生 smoke 只確認
  視窗及程序存活，不代表完整 WebView 互動；互動移除及刪除資料選項未自動測試。
- Linux API credentials require an unlocked Secret Service keychain. No plaintext
  fallback. Keychain records may remain after uninstall; remove routes first.
  Linux 憑證需要已解鎖金鑰庫，不會回退至明文；移除程式前請先移除 API 路由。
- Updates are queried only by Settings → Check for updates. Updates require an existing published stable release; no notice for drafts,
  prereleases, invalid/older/equal versions, absent releases, offline, timeouts,
  malformed responses or GitHub rate limits. Never auto-download/install.
  只在設定按「檢查更新」才查詢；更新僅提示較新的正式公開版本；其他情況保持安靜，絕不自動下載或安裝。
- macOS, Windows ARM64, signing, local models and automatic updates are out of scope.
  不支援 macOS、Windows ARM64、簽署、本機模型或自動更新。

## M7 beta limitations / M7 beta 限制

- **NOT RUN / USER ACTION REQUIRED:** real API keys and provider billing behavior,
  real Windows Credential Manager/Linux Secret Service integration (including locked
  stores, credential replacement/removal and restart), physical-device interactions.
  Automated tests use fake credentials/mock keychain IPC and local providers only.
  真實 API、真實金鑰庫及實體桌面未執行；mock 通過不可替代人工測試。
- Chat, tool data and recovery backups are local but unencrypted. Redaction covers
  configured keys and common patterns, not arbitrary secrets or every sensitive
  file. Review history exports and folder grants before sharing/using API tools.
  本機資料及備份不加密；遮蔽無法辨識所有秘密，請檢查匯出及授權資料夾。
- Export/delete controls are component-specific. History export excludes calendar,
  journal, assets, grants and backups. Clearing chats does not clear those components;
  uninstall does not guarantee credential removal. No app-wide export/delete feature.
  匯出／刪除僅針對現有元件，不是全應用程式資料管理。
- Pet packs mean the current appearance library with PNG/JSON import only; no ZIP,
  executable plugins, marketplace or generated artwork. Calendar supports single UTC
  events only; the app must run for reminders. Stub chat has no persistent history.
  素材只支援現有外觀匯入；行事曆只支援單次 UTC 事件，stub 不保存聊天歷史。
- Windows smoke's missing `uninstall.exe` carry-over is **P2**, fixed in M7 with a
  Windows child-process negative regression requiring non-zero exit. Normal smoke
  still checks executable removal, HKCU uninstall-entry cleanup and CI sentinels.
  This validates disposable runner fixtures, not real user-data migration.
  Windows 缺少卸載程式的 P2 已修正，並保留正常移除／登錄檔／測試資料保留驗證。

Use the [beta plan and results template](beta-test-plan.md) to record evidence.
Interactive install/uninstall, missing WebView2, FUSE, Wayland and physical desktops
remain untested unless a separately recorded user-run result says otherwise.
互動安裝／移除、缺少 WebView2、FUSE、Wayland 與實體桌面仍未驗證。

- Offline UI disables sending chat, including the fixed stub; use existing history,
  appearances and Local tools (offline). Skipping setup does not install a model.
  離線 UI 會阻止傳送聊天（包括 stub）；仍可使用歷史、外觀及本機工具。
