# ADR 0002: Recoverable native hit-testing for click-through

- Status: Accepted for M0, best effort on Windows / Linux X11
- Date: 2026-11-02

## Context

CSS `pointer-events: none` does not pass clicks through an OS window to another application. Setting the entire window to ignore cursor events also stops the webview receiving mouse movement, so a webview-only mouseenter solution can leave a pet unreachable.

## Decision

Use Rust `WebviewWindow::set_ignore_cursor_events`, equivalent to the frontend `setIgnoreCursorEvents` API. A backend worker polls the global cursor every 40ms, even while the webview ignores events. React publishes opaque sprite row runs derived from the animated SVG bounds every 100ms; the chat bubble and its tail are also interactive. Transparent pixels between ears and outside the sprite remain pass-through. Convert physical cursor/window coordinates to logical CSS coordinates using the window scale factor. Retain interaction during a native drag.

Native left-button queries on Windows (`GetAsyncKeyState`, left button only) and X11 (`XQueryPointer`) detect release after `startDragging` consumes DOM events. A gesture remembers maximum cursor/window displacement, not just its final point: moving away and back is still a drag. A stationary release emits one `pet-click` event; dragging never emits a click. There is a timeout to clear abandoned gestures. Wayland has no global input query, so it uses a DOM movement threshold before native dragging.

Enable automatic hit-testing by default only outside detected Wayland sessions. A native API failure disables it and attempts to restore cursor interaction. The tray checkbox and Ctrl+Shift+I offer an independent toggle, and Ctrl+Shift+P / Show-Hide recover visibility. A shortcut conflict logs a warning without preventing startup. No region publication means the window remains interactive.

## Platform limits

| Platform | M0 behavior / limits |
| --- | --- |
| Windows | Native cursor-ignore and global position queries; test real desktop scaling, monitors and drag loops. Unsigned installers may show SmartScreen. |
| Linux X11 | Best effort through the window manager / XShape support; compositing required for transparency. Tray requires AppIndicator support. Global cursor polling restores interaction without webview hover. |
| Linux Wayland | Automatic click-through and global shortcuts disabled conservatively when WAYLAND_DISPLAY is present, including XWayland sessions. Compositor security may restrict global coordinates, positioning, topmost/taskbar hints and global shortcuts. Tray/ordinary interaction remain the fallback when supported. |

## Consequences

Polling adds small CPU/IPC overhead and up to 40ms transition latency; animated bounds can lag up to 100ms. Very fast clicks near a hit-region boundary may reach the wrong window. This is a PoC rather than an OS input-region implementation. The user can disable automatic pass-through. Native per-pixel regions or compositor-specific integrations can be evaluated later. No keyboard input capture or global mouse history is retained.

## Manual acceptance

1. With a window behind the pet, click outside the opaque pixels: the underlying window should receive the click; move back onto the pet: interaction should recover.
2. Click the pet once: one bubble opens. Drag beyond five logical pixels (also away and back): no chat toggle. Repeat with the bubble open.
3. Send Traditional Chinese, Latin text and an empty/whitespace message; only nonempty text produces the exact stub prefix.
4. Toggle pass-through from both tray and hotkey. Show/Hide twice; Quit exits the process. Test with a deliberately occupied shortcut.
5. Repeat on Windows and composited X11 with different DPI scales. On Wayland verify click-through is disabled, then test available compositor behavior and tray controls.
