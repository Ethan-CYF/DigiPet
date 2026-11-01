# ADR 0003: Local appearance data and seven-state Canvas animation

- Status: Accepted for M1; supersedes the local-model roadmap in ADR 0001
- Date: 2026-11-02

## Context

M1 extends M0 on Windows and Linux X11. It implements appearance and animation, not AI routing. Later AI is API-only (OpenAI-compatible / DeepSeek); no llama.cpp, Ollama or model downloading. Existing AI/model interfaces remain unwired historical contracts.

## Decision

Use the existing `pet-upload` module for user-selected local PNG decoding, crop, strict sheet validation and localStorage persistence. No image service, cloud sync, archive extraction, filesystem plugin or new native pack command. The default appearance preserves M0's original MIT pixel artwork. Single images are cropped in source coordinates, normalized to PNG with a maximum 256-pixel edge, then animated procedurally. Sheets remain equal-cell PNGs with row-major, zero-based frame indices, grid dimensions, FPS and state maps. Exactly seven states exist: idle, walk, happy, thinking, talking, sleep, sad. Missing or empty non-idle mappings fall back to idle frames, not a new state. UI and native drag events trigger transitions; there is no LLM trigger. Repeated state events preserve the frame clock; changing state resets it. Manual state selection cancels queued stub transitions.

PNG byte/dimension limits are checked before browser decoding; browser decoding must succeed before normalization. APNG/SVG and trailing data are rejected. Strict JSON validation rejects unknown fields, extra states, paths/URLs/code fields, invalid grid/FPS/frame data and prototype keys. Bounded JSON and image inputs, maximum eight saved appearances and a bounded library avoid unbounded allocation. There is no eval, dynamic module loading or pack-provided native path. React renders names/errors as text. A bad selected image restores the default; corrupt saved data loads the default; quota/permission errors retain the previous library. Entirely invisible crops are rejected. Deleting an appearance never touches its original file.

Render all appearances on a 128×128 Canvas. Single images have distinct breathing, bobbing, floating and scaling poses; sheets use configured frames. Reduced-motion preference freezes periodic single-image motion. Publish row runs from the current Canvas alpha (>8/255) every 100ms, replacing ADR 0002's fixed 16×16 mask. The native rectangle limit is 8193 (worst-case 128×128 alternating pixels plus the bubble). No opaque pixels leaves ordinary interaction enabled. M0 native cursor polling, drag threshold, tray recovery and Wayland limits remain.

Store physical window left/bottom coordinates in a fixed app-config `position-v1.txt`. The backend writes after 500ms without movement and on tray Quit, using a temporary file and rename. Restart restores the bottom anchor independent of expanded UI size, then clamps to the closest available full monitor bounds, including negative origins. Expansion and Show/Hide also recover offscreen windows. This is best effort: taskbar work areas, mixed DPI, compositor behavior and screens smaller than the manager can affect placement. Wayland position persistence is disabled along with M0 automatic click-through and global shortcuts. Source image/pack data never controls this fixed backend path.

The local manager expands M0's window to 360×640, retaining the pet's left/bottom anchor where the monitor permits; chat remains 200×400 and idle 200×200. Near screen edges clamping can move the pet so controls remain accessible. The manager scrolls; Escape/close dismisses the whole bubble.

## Validation and limits

Unit tests cover all state transitions, looping/FPS/fallback, current-alpha gaps, strict pack validation, storage corruption/quota, and chat/drag controls. Chromium smoke tests exercise actual PNG decoding/cropping/rendering, procedural movement, sheet playback, swapping/deletion, reload persistence and hostile input recovery. CI runs browser smoke and an eight-second Xvfb X11 startup smoke on Linux plus frontend/native checks and unsigned packaging on Linux/Windows. Browser smoke does not establish native desktop transparency, tray, hotkeys or real multi-monitor/DPI behavior. Those require the manual checks below; do not claim an unrun desktop/OS.

## Manual desktop acceptance

1. On composited X11 and Windows, drag the pet (including away and back); click toggles once, Escape/close dismisses. Show/Hide, click-through toggle, both hotkeys and tray Quit still work. Verify transparent pixels pass through while opaque current frames remain reachable.
2. Use State to visit exactly the seven states. Send stub text, observe thinking → talking → idle; manually select sleep during a pending reply and ensure it stays sleep.
3. Import/crop a PNG, save/apply, restart. Verify character and position restore. Import a two-cell sheet using README JSON, test all mappings and missing-state idle fallback, switch, delete and restore default.
4. Try invalid/truncated PNG, oversized PNG, invalid JSON, code/path fields, bad indices and extra states. No crash or code execution; bad images restore default. Disable/fill storage and check errors preserve the prior saved library.
5. Move to another/negative-origin monitor, restart, remove that monitor and restart again. Test mixed DPI and expansion near screen edges. On Wayland verify M0's documented disabled features and available ordinary interaction.

## 中文摘要

M1 僅實作本機外觀與七狀態動畫；後續 AI 僅用 API。PNG／JSON 不含程式碼或任意路徑，素材不進 Rust；使用瀏覽器解碼、Canvas 裁切與 localStorage 保存。單圖只有程序動作，sheet 使用等格影格資料。穿透取目前 Canvas alpha，不重用 M0 遮罩。位置由固定設定檔保存，重啟盡力移回可見螢幕；Wayland 維持限制。瀏覽器測試不代表原生視窗／Windows／多螢幕實測。
