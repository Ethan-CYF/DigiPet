# M6 release pipeline / M6 發行流程

The existing [build workflow](../.github/workflows/build.yml) builds and tests
Windows x64 on `windows-latest` and Linux x64 on **`ubuntu-24.04`**. Version stays
`0.1.0`; no signing, tags or published releases are produced by this development
work. / 直接擴充既有 workflow，版本不變，本次工作不建立 tag 或公開發佈。

| Trigger / 觸發 | Result / 結果 | Token permissions / 權限 |
| --- | --- | --- |
| Branch push / PR | Tests, installers, smoke and workflow artifacts / 測試、安裝包、artifacts | `contents: read` |
| `workflow_dispatch` | Artifacts only; no release / 僅 artifacts，不建立 Release | `contents: read` |
| Existing `v*` tag push | Same checks, then create/reuse **Draft only** / 通過後僅 Draft | Build/read; draft job only `contents: write` |

**Do not create a tag to test M6.** A maintainer can manually run the branch's
workflow (`gh workflow run build.yml --ref feat/m6-release-pipeline`) once the
workflow is available to dispatch. Branch pushes already exercise the same
installer jobs. / **不要為了測試 M6 建立 tag。** 分支 push 已會執行相同安裝包測試；
workflow 可 dispatch 後可手動執行分支，僅上傳 artifacts。

No custom secrets or paid services. Only built-in `GITHUB_TOKEN`, with write access
limited to the tag-event draft job. Existing credential-pattern scan and mocked
provider tests remain. Dependencies are locked; platform targets explicitly x64.
不需要自訂 secrets 或付費服務；測試使用 mock provider，不使用真實 API keys。

## Artifacts and integrity / 產物與校驗

- `DigiPet-windows-x64-unsigned`: `DigiPet-Setup-windows-x64.exe` and platform `SHA256SUMS`.
- `DigiPet-linux-x64-unsigned`: `DigiPet-linux-x64.AppImage`, `DigiPet-linux-x64.deb` and platform `SHA256SUMS`.
- `DigiPet-unsigned-windows-linux-x64`: all three installers and a complete `SHA256SUMS`.
- `installer-smoke-windows-x64`, `installer-smoke-linux-x64`: evidence and explicit limitations.
- `performance-Linux`: existing browser/performance evidence.

Installers are hashed, uploaded, **downloaded again and verified before smoke**.
After both platforms succeed, downloaded platform manifests are checked and merged
into a complete manifest, then the combined artifact is also downloaded/verified.
Tag runs re-download Draft assets and verify them too. Missing, extra, duplicate or
changed installer entries fail verification. / 校驗涵蓋所有安裝包；上傳後會重新下載核對，
合併產物亦再次下載驗證。tag 流程亦會下載 Draft assets 核對。

Repeatable means successful rebuilds from the same source and locked dependencies,
**not bit-for-bit identical output**: toolchains, runners, timestamps and external
bundler tools can change. SHA256SUMS always describes that run's actual bytes.
「可重複」指相同原始碼可再次成功建置，不代表逐位元相同；每次清單均對應當次檔案。

## Smoke and limits / Smoke 與限制

CI-only guarded scripts refuse to run outside GitHub runners. Windows silently
installs per-user, requires an unsigned executable and visible native window,
uninstalls and checks preservation of synthetic data/packs/history sentinels.
Linux installs deb via apt, launches deb and AppImage under Xvfb/X11, checks a native
window, removes deb and verifies synthetic data sentinels in isolated XDG roots.
AppImage uses `APPIMAGE_EXTRACT_AND_RUN=1` so CI does not require FUSE.
腳本只可在 CI 執行，僅使用測試資料；Windows 驗證靜默安裝及移除，Linux 使用獨立 XDG
目錄測試套件安裝、X11 視窗和移除，並確認測試資料獲保留。

Not covered: interactive installer/uninstaller/delete-data opt-in, SmartScreen,
missing/offline WebView2, AppImage FUSE mounting, complete packaged webview
interaction, Wayland and real desktop integration. Browser interaction tests use
mock APIs separately. See [known issues](known-issues.md). / 未驗證範圍包括互動安裝／移除、
SmartScreen、離線 WebView2、FUSE、完整套件 WebView 互動及實體桌面。

## Draft safety and reruns / Draft 安全及重跑

Only an existing tag push can reach the write job. The tag must equal the existing
app version and resolve to the checked-out source commit before Draft creation.
Draft creation always uses `draft: true`, `make_latest: false`. Existing published
releases cause failure without modification. Reruns reuse the Draft and replace
only the four known same-name assets, avoiding duplicates; draft status is rechecked
before each asset mutation. A concurrently published Draft stops further writes.
There is no publish operation or tag-creation API in the scripts.
只有已存在的 tag push 可進入寫入 job；tag 必須符合既有版本及原始碼 commit。
重跑只更新同一 Draft 的四個指定 assets；遇到已公開版本會停止，絕不自動發佈。
