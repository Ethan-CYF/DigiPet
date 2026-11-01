# ADR 0001: Tauri v2 + React + TypeScript + Rust

- Status: Accepted for M0
- Date: 2026-11-02

## Context

DigiPet needs a small transparent desktop window, native dragging, tray controls and future AI routing. M0 must establish a buildable open-source foundation for Windows and Linux with no model integration.

## Decision

Use Tauri v2 for the desktop runtime, Rust for native integration, React + TypeScript + Vite for the interface, and pnpm with a committed lockfile. Keep `src/` and `src-tauri/` at the repository root. Preserve the original MIT license and copyright.

Limit targets to Windows (MSVC, WebView2, unsigned NSIS) and Linux (GTK3/WebKitGTK 4.1, unsigned deb/AppImage). No macOS target or signing credentials. GitHub Actions builds both platforms; artifacts are uploaded without creating releases or merging PRs.

Native commands expose only hit regions, gesture monitoring/cancellation and window sizing. The main webview capability permits only event listening/unlistening and native dragging. No filesystem, shell, network or shortcut registration permissions are granted to the frontend. Rust registers fixed shortcuts and owns the tray. The production CSP admits local assets and Tauri IPC only. Messages stay in React state and are rendered as text.

Reserve interface-only modules for `ai-router` (local versus OpenAI-compatible endpoint, including DeepSeek), `model-wizard` and `pet-upload`. M0 replies are deterministic local stubs. No API keys, LLM calls, model downloads or upload pipeline.

## Consequences

Use the OS webview instead of shipping a browser runtime. Windows and Linux need different native prerequisites; behavior depends on desktop compositors. Native compilation must be validated separately from `pnpm build`. The 200×200 idle window expands upward for chat so the pet remains anchored. A later milestone can improve screen-edge placement and persistence.
