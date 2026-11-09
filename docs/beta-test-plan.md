# M7 beta test plan and results / Beta 測試計劃及結果

Version / 版本: **0.1.0**. Windows x64 + Linux x64 only; Linux CI **ubuntu-24.04**.
No local models, paid calls, real credentials, tags or GitHub Release objects.
只使用假憑證、mock IPC、loopback 供應商及可棄置資料；不在使用者桌面安裝。

## Automated matrix / 自動測試矩陣

Inspect/reuse existing coverage before adding tests. Only the missing fresh
successful API setup-to-chat flow and Windows P2 negative path were added for M7,
plus manual-update behavior and version consistency regressions.
M7 沿用現有測試，只補缺少的首次 API 成功流程、Windows 負面路徑、手動更新和版本檢查。

| Flow / 流程 | Observable result / 可觀察結果 | Evidence / 覆蓋 |
| --- | --- | --- |
| Fresh launch → API setup → chat | Consent required; saving sends no provider request; fake credential stays out of localStorage; first reply and history/settings survive reload / 需同意、儲存不呼叫供應商、還原成功 | `tests/browser/beta.spec.ts`: browser UI + mocked credential IPC + local OpenAI-compatible HTTP server |
| Skip-model/API flow | Skip setup, retain fixed local stub, no model download, completion restored and key field empty / 略過 API，保留 stub，沒有本機模型 | Existing `api-setup.spec.ts`, `ApiSettings.test.tsx`, `model-wizard.test.ts` |
| Streaming, Stop, consent | Partial output/status saved, history can continue; revoked consent blocks / 停止、繼續及撤回同意 | Existing `chat.spec.ts`, `ai-router.test.ts`; native `api.rs` local transport fixtures |
| Offline and restart | Offline UI remains available; granted real Rust calendar/journal writes and file search work; restart retains data and grants / 真正 Rust 引擎離線及重啟 | Existing `hardening.spec.ts`, `offline-native.spec.ts` (browser reload + actual Rust fixture process restart) |
| Appearance persistence | PNG/sheet import, switch, delete, reload and corrupt-data fallback / 外觀匯入、刪除及還原 | Existing `appearance.spec.ts` |
| Tools and permission boundary | Exact preview; reject/Stop/revoke prevents writes; traversal, injection, replay denied / 寫入及權限界線 | `tools.spec.ts`, `tests/tools-e2e.test.ts`, tools-core Rust tests, TS hardening tests |
| Windows uninstall P2 negative | Simulated successful install/launch with no uninstall.exe makes the production smoke **exit non-zero** with the specific error / 成功安裝但缺少卸載程式必須失敗 | `scripts/release/test-smoke-windows.ps1`, Windows CI only; child-process exit check, no source assertion |
| Normal Windows uninstall | Real unsigned NSIS install/window launch; uninstall removes both executables and HKCU entry, preserves CI data/history/packs sentinels / 真實安裝包正常卸載 | `scripts/release/smoke-windows.ps1`, Windows CI only |
| Linux native package smoke | deb install/remove, Xvfb/X11 window, AppImage extract-and-run, disposable data retained / Linux 套件 smoke | `scripts/release/smoke-linux.sh`, ubuntu-24.04 only |
| Manual updates | No startup request; explicit check only; page opens only on click; failures silent; metadata has no Authorization header / 無啟動查詢、無金鑰 | `UpdateNotice.test.tsx`, native `updates.rs` loopback tests |
| Release integrity/version | Re-download every installer, SHA256SUMS rejects tampering; three app version files equal 0.1.0 / 所有檔案校驗及版本一致 | `artifacts.test.mjs`, CI integrity job |
| Credential hygiene | No matched secret values printed; export/audit redaction fixtures / 不輸出匹配值 | `scripts/check-secrets.mjs`, `chat-history.test.ts`, `hardening.test.ts`, native API tests, tools-core audit test |

Frontend unit/tool tests run on both Windows and Linux. Browser interactions run
on Linux with mock native IPC; they do not prove packaged WebView or real keychain
behavior. Native API transport tests use fake credentials and loopback only.
Normal installer smoke proves a native window/process, not every webview control.
Windows/Linux unit tests、Linux 瀏覽器互動及原生 smoke 是不同層級，不可互相代替。

## Recorded M7 cloud results / 已執行的雲端結果

2026-11-09 (JST). Source is the M7 branch; final commit and CI status must be matched
using the final-head record below. Cloud is Linux, Node 24.19.0, Chromium 154.0.8037.57,
Rust 1.99.1; this differs from CI's Node 22/ubuntu-24.04 baseline.
雲端環境與 CI 基準不同，不能把本機結果當作最終 PR head 的 Windows／Linux CI 結果。

| Check / 檢查 | Cloud result / 雲端結果 |
| --- | --- |
| TypeScript/Vite production build | PASS |
| Frontend unit/interaction suite | PASS — 100 tests |
| Release integrity/mock draft guards/version consistency | PASS — 5 tests; GitHub operations mocked, no release object created |
| tools-core Rust suite | PASS — 22 tests (includes 256 cases for each property) |
| Real Rust fixture + mock model integration | PASS — 6 tests |
| Chromium browser suite | PASS — 10 tests, including fresh API setup/chat and offline Rust restart |
| Repository credential-pattern scan | PASS; pattern scan is not proof against every possible secret |
| Native Tauri check/tests | BLOCKED in Cloud: missing GObject/GTK/WebKit development prerequisites; assigned to CI |
| Windows P2 child-process/installer smoke | CI only; do not infer PASS from Linux tests |
| Final Windows + ubuntu-24.04 CI | Record final head/run below; pending until directly observed |

Commands: use the README development/test commands. In this Cloud image the
available package runner was pnpm 11; locked dependencies were installed without
changing repository manifests/lockfiles, and equivalent npm scripts/local binaries
ran the checks. CI uses the repository-pinned pnpm 10.30.3 and Node 22.

## Manual checklist / 人工清單

**Every item below: NOT RUN / USER ACTION REQUIRED.** Documentation only: Codex
must not request/use real keys or report these as passed. The user decides whether
and when to run them. Keep keys, private content and unredacted screenshots out of
issues, logs and result forms. / 以下全部未執行；由使用者最後決定及操作，不要提供真實金鑰。

| Item / 項目 | User steps and expected evidence / 使用者步驟及預期 | Status / 狀態 |
| --- | --- | --- |
| Real API key | On a chosen supported device, configure a provider, consent, send one nonsensitive chat, Stop and check the provider's own usage/billing; no key in result / 真實供應商聊天及計費行為 | NOT RUN / USER ACTION REQUIRED |
| Windows Credential Manager | Save/restart/replace/remove a test credential; check OS vault entries and no UI key refill; test unavailable vault behavior / 真實 Windows 金鑰庫 | NOT RUN / USER ACTION REQUIRED |
| Linux Secret Service | Unlocked/locked/unavailable store and session D-Bus, restart/replace/remove; no plaintext fallback / 真實 Linux 金鑰庫 | NOT RUN / USER ACTION REQUIRED |
| Physical Windows desktop | Drag/click/transparent holes, tray, shortcuts, Stop, focus, DPI/multiple monitors/position restoration and packaged webview export / 實體 Windows 互動 | NOT RUN / USER ACTION REQUIRED |
| Physical Linux X11 | Compositor/transparency, tray support, shortcuts, monitors, package UI and export / 實體 X11 | NOT RUN / USER ACTION REQUIRED |
| Physical Linux Wayland | Confirm documented reduced functionality; tray/drag/window behavior on the chosen compositor / 實體 Wayland 限制 | NOT RUN / USER ACTION REQUIRED |
| Interactive install/uninstall | Unsigned/SmartScreen prompts; preserve selected user-data fixtures by default, separately test explicit delete-data opt-in with disposable data / 互動安裝、保留及明確刪除資料 | NOT RUN / USER ACTION REQUIRED |
| Missing/offline WebView2 | Isolated Windows test device; check official runtime prerequisite/download/prompt behavior / 缺少 WebView2 | NOT RUN / USER ACTION REQUIRED |
| AppImage FUSE | Supported physical Linux environment with FUSE mount; compare extract-and-run fallback / FUSE 掛載 | NOT RUN / USER ACTION REQUIRED |
| Complete privacy cleanup | Export review, per-component deletion, route removal/keychain cleanup, uninstall and separately retained files/backups; no claim of secure erase / 完整人工資料清理檢查 | NOT RUN / USER ACTION REQUIRED |

## Results template / 結果範本

Copy this form per run; never replace NOT RUN with PASS without evidence.
每次測試填寫一份，未執行項目必須保留 NOT RUN。

```text
Source commit (full SHA):
Branch / PR URL:
CI run URL and checked head SHA:
Windows build + P2 negative + normal smoke: PENDING / PASS / FAIL
ubuntu-24.04 build + browser + native smoke: PENDING / PASS / FAIL
Integrity job:
Date/time/timezone:
OS/version/architecture; X11 or Wayland; WebView2/WebKit version:
Installer artifact + SHA256SUMS source run and verification result:
Toolchain and commands:
Case IDs / expected / actual / PASS, FAIL, NOT RUN:
Evidence links (redacted, no credentials):
Failure reproduction and issue link:
Real API-key: NOT RUN / USER ACTION REQUIRED
Real OS-keychain: NOT RUN / USER ACTION REQUIRED
Physical desktop: NOT RUN / USER ACTION REQUIRED
Interactive install/uninstall, missing WebView2, FUSE, Wayland: NOT RUN / USER ACTION REQUIRED
Tester; remaining blockers; publication decision (user only):
```

Final-head CI evidence is linked from the PR/final task report; a green earlier
commit cannot satisfy final-head acceptance. This document is not publication approval.
最終 head 的 CI 證據見 PR／工作報告，較早 commit 綠燈不可代替最終 head；此文件不是發行批准。
