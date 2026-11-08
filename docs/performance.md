# M5 performance measurements / 效能量測

Run `pnpm test:perf` after `pnpm exec playwright install chromium`. Set
`DIGIPET_CHROMIUM` to an existing Chromium binary when appropriate. The measurement
is a Playwright script in `tests/browser/hardening.spec.ts`; the normal browser
suite also runs it. It creates `test-results/**/performance-baseline.json` and a
JSON test attachment. Linux CI uploads these as **M5-performance-Linux** on every
run, including failures. No API key, network provider or paid call is needed.

The existing CI environment stays **ubuntu-24.04**, Node 22 and the Chromium
bundled with pinned Playwright 1.58.2. Every result records actual OS/kernel, CPU
model/count, Node/Chromium versions and GitHub runner image/version. Compare runs
on the same runner image; shared-runner scheduling and CPU scaling cause variance.

The scenario uses the existing 128×128 canvas with its 30 Hz timeout scheduler,
a pending 1.8 s mocked AI response and a concurrent delayed tool IPC response.
It records draw samples and median/p95 draw intervals, renderer `TaskDuration`
delta (CPU work in seconds), JS heap size and heap delta through Chromium CDP.
This is a basic **renderer** baseline, not native-process RSS, a GPU measurement
or a guarantee for all desktops. Real local-tool correctness is independently
covered through the Rust fixture and offline browser integration test.

A Codex Cloud development observation (not the GitHub CI baseline): Linux kernel
6.18.57, AMD EPYC 9V74, 5 logical CPUs, Node 24.19.0, Chromium 154.0.8037.57:
55 draws; median 33.2 ms, p95 33.4 ms; renderer task delta 0.084316 s; heap
4,933,408 bytes, delta +626,932 bytes over the scenario. These are measured values,
not performance budgets; the CI artifact supplies the baseline for its own runner.
A short heap delta includes normal allocation and is not evidence of a leak.

The liveness assertion only requires continued drawing during pending work;
there is no invented fixed FPS/CPU pass threshold. Tauri tool IO/search and folder
selection run in blocking workers. The animation effect retains its state
when repeated streaming updates request the same state, avoiding repeated image
decode/timer recreation. Effect teardown clears timers, subscriptions and pending
requests; download URLs are revoked after use. Rerun the measurement if changing
animation scheduling, provider streaming or tool execution.

繁體中文：`pnpm test:perf` 會產生 CPU 工作時間、JS heap、繪製間隔與實際執行環境
JSON，CI 固定 ubuntu-24.04 並保留 **M5-performance-Linux** artifact。上列 Cloud
數值是實測參考，CI 基準以各次 artifact 為準；不設定不切實際的固定 FPS／CPU 門檻。
量測涵蓋 renderer；不把短時間 heap 增量誤稱為記憶體洩漏。
