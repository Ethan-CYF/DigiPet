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
- Updates require an existing published stable release; no notice for drafts,
  prereleases, invalid/older/equal versions, absent releases, offline, timeouts,
  malformed responses or GitHub rate limits. Never auto-download/install.
  更新僅提示較新的正式公開版本；其他情況保持安靜，絕不自動下載或安裝。
- macOS, Windows ARM64, signing, local models and automatic updates are out of scope.
  不支援 macOS、Windows ARM64、簽署、本機模型或自動更新。
