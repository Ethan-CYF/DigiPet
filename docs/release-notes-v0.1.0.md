# DigiPet v0.1.0 beta — release notes documentation draft / 發行說明文件草稿

**Repository documentation only. Not a GitHub Release, including Draft Releases.**
No tag, Release object or publication is created/authorized by this document.
**只屬儲存庫文件草稿，不是 GitHub Release（包括 Draft）。不建立 tag，也不代表批准發行。**

> **Unsigned / Unverified Publisher — 未簽署／未驗證發行者。**
> No signing or notarization. Expect Windows SmartScreen/unknown publisher warnings
> and possible managed-device blocks. SHA-256 checks integrity, not publisher identity.
> 沒有簽章或公證；預期出現 SmartScreen／未知發行者警告，受管理裝置可能禁止執行。
> SHA-256 只核對完整性，不能驗證發行者。

Version / 版本: **0.1.0** in package.json, Cargo.toml and tauri.conf.json; no bump.
Final source SHA and successful final-head Windows/ubuntu-24.04 workflow URL must
be taken from the matching PR/task report before any later user-authorized publication.
日後若由使用者決定發行，必須先補上對應最終 head 的來源 SHA 及 CI 證據。

## Included / 內容

- Windows x64 NSIS and Linux x64 AppImage + `.deb`; Linux baseline **ubuntu-24.04**.
  Windows x64 及 Linux x64，沒有 macOS 或 ARM64 版本。
- Desktop pet with seven animation states, dragging, tray/shortcuts and supported
  click-through/position restoration. Local appearance-library PNG/JSON imports.
  七狀態桌寵、桌面互動及現有外觀庫匯入，不含素材市場或生成服務。
- API-only OpenAI-compatible streaming chat, consented routes, opt-in fallback,
  Stop and local conversation history. Skip setup retains a fixed local stub;
  no local model installation/download. / API 對話及歷史；略過設定只保留本機 stub。
- Calendar, report, journal, coding and file-search tools with scoped grants and
  explicit write previews/confirmation; offline local calendar/journal/search.
  五種權限工具，每次寫入須確認；本機工具可離線使用。
- Existing chat JSON export, component-specific deletion and backup/repair.
  No new application-wide export/delete functionality. / 沿用現有匯出、刪除及備份修復。
- M7 fixes the **P2** Windows missing-uninstaller smoke gap with a genuine failing
  child-process regression, and changes updates to explicit **Check for updates**
  only. Bilingual README/User Guide, beta plan and scoped security review added.
  修正 Windows P2、改為手動檢查更新，完成雙語文件及範圍內安全審查。

## Obtain, verify and install / 取得、校驗及安裝

No published release is promised by this draft. Until the user separately decides
to publish, use the matching successful CI run's unsigned artifacts (GitHub access
required; artifacts expire after 14 days). Download the installer and SHA256SUMS
from the **same trusted run**. / 本草稿不代表已有公開版本；可使用同一可信 CI run 的 artifacts。

| File / 檔案 | Use / 用途 |
| --- | --- |
| `DigiPet-Setup-windows-x64.exe` | Windows per-user installer / Windows 個人帳戶安裝 |
| `DigiPet-linux-x64.AppImage` | Linux executable; needs host libraries / Linux 執行檔，仍需系統依賴 |
| `DigiPet-linux-x64.deb` | Debian/Ubuntu package / Debian／Ubuntu 套件 |
| `SHA256SUMS` | All three installer hashes / 三個安裝包校驗碼 |

Windows PowerShell: require one exact checksum entry, compare, then run the installer.
Windows：確認校驗碼項目唯一且相符，才執行安裝程式。

```powershell
$name = 'DigiPet-Setup-windows-x64.exe'
$entries = @(Get-Content .\SHA256SUMS | Where-Object { $_ -match ('^[a-f0-9]{64}  ' + [regex]::Escape($name) + '$') })
if ($entries.Count -ne 1) { throw 'Missing/duplicate checksum entry' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $name).Hash.ToLowerInvariant() -ne $entries[0].Substring(0, 64)) { throw 'SHA-256 mismatch: do not install' }
.\DigiPet-Setup-windows-x64.exe
```

Linux, with all three installer files present, verify everything first. If only
Linux files were downloaded, use the exact-entry filtering procedure in [install.md](install.md).
Linux：先核對；只下載 Linux 檔案時，請用安裝指引的指定項目校驗方法。

```sh
sha256sum --check --strict SHA256SUMS
# After successful verification, choose one / 校驗成功後選一種：
sudo apt install ./DigiPet-linux-x64.deb
# OR / 或：
chmod +x DigiPet-linux-x64.AppImage
./DigiPet-linux-x64.AppImage
# Without FUSE / 沒有 FUSE 時：
APPIMAGE_EXTRACT_AND_RUN=1 ./DigiPet-linux-x64.AppImage
```

Windows needs WebView2; missing runtime download/prompt behavior is not yet manually
validated. Linux needs WebKitGTK 4.1/GTK 3 and host libraries; older glibc systems
may fail. Follow [User Guide](user-guide.md) for first launch → API setup → chat,
or skip API setup to retain the local stub. / 先確認 runtime 依賴，首次使用步驟見使用者指南。

Quit before uninstalling. Windows: Settings → Apps → DigiPet → Uninstall; leave
Delete app data unchecked to preserve data. Linux: `sudo apt remove digi-pet` or
delete the AppImage. Remove API routes with the vault unlocked before uninstall;
keychain records and exported files may require separate cleanup. See [install.md](install.md).
退出後才移除；預設保留資料，金鑰庫及匯出檔案需另行清理。

## Known issues and test boundaries / 已知問題及測試界線

- **NOT RUN / USER ACTION REQUIRED:** real API-key/provider billing, real Windows
  Credential Manager/Linux Secret Service, physical desktop and packaged WebView
  interactions. Automated provider tests use fake credentials/local mocks only.
  真實金鑰、金鑰庫及實體桌面未測，不可當作通過。
- Interactive installer/uninstaller/delete-data opt-in, missing/offline WebView2,
  AppImage FUSE mounting and Wayland remain untested. CI uses silent install/remove,
  disposable data and Xvfb/X11; native window smoke does not prove complete UI behavior.
  互動安裝、WebView2、FUSE、Wayland 仍未驗證。
- Wayland disables automatic click-through, global shortcuts and position restore.
  X11 needs compositing; trays, DPI and monitors vary. / 桌面功能視平台及 compositor 而定。
- Local data/backups/exports are unencrypted; redaction cannot identify arbitrary
  secrets. Export/delete controls are component-specific, not a full-app erasure
  system. / 本機資料不加密；匯出／刪除有界線，不保證安全抹除。
- Check updates explicitly in Settings. Metadata only, manual download/install,
  no automatic checks, downloads or installation; absent/error/offline results are silent.
  在設定手動檢查；沒有正式版本或失敗時不提示。

See [known issues](known-issues.md), [beta plan/results](beta-test-plan.md) and
[security notes](security-notes.md). Within the audited paths, no confirmed P0/P1
finding remains; this is not a blanket security guarantee. Final-head CI is a
separate readiness gate and must be observed on both platforms before claiming acceptance.
範圍內沒有已確認未解決的 P0／P1，但不是整體安全保證；最終 head 的兩平台 CI 仍須有直接證據。

## Next version / 下一版本

Planned only: complete user-run beta checks, triage reproducible defects, then
prioritize fixes and Windows/Linux desktop compatibility/documentation in 0.1.x.
The user decides whether to publish v0.1.0. No platform expansion, signing, local
models, paid service or automatic update commitment.
僅規劃：先完成人工 beta 檢查，再處理可重現問題與 0.1.x 桌面相容性／文件；發行由使用者決定。
