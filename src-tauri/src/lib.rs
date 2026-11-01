use serde::Deserialize;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Clone, Copy, Debug, Deserialize)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}
impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && y >= self.y && x < self.x + self.width && y < self.y + self.height
    }
}
struct Gesture {
    cursor: (f64, f64),
    origin: (i32, i32),
    moved: bool,
    started: Instant,
}
struct Interaction {
    enabled: bool,
    ignoring: bool,
    rectangles: Vec<Rect>,
    gesture: Option<Gesture>,
}

fn is_wayland() -> bool {
    cfg!(target_os = "linux") && std::env::var_os("WAYLAND_DISPLAY").is_some()
}

// Query only the left button. Never capture or retain keyboard input.
#[cfg(target_os = "windows")]
fn left_button_down() -> Option<bool> {
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
    Some(unsafe { GetAsyncKeyState(VK_LBUTTON as i32) } < 0)
}
#[cfg(target_os = "linux")]
fn left_button_down() -> Option<bool> {
    if is_wayland() {
        return None;
    }
    use x11_dl::xlib;
    let x = xlib::Xlib::open().ok()?;
    unsafe {
        let display = (x.XOpenDisplay)(std::ptr::null());
        if display.is_null() {
            return None;
        }
        let root = (x.XDefaultRootWindow)(display);
        let (mut root_return, mut child) = (0, 0);
        let (mut root_x, mut root_y, mut win_x, mut win_y, mut mask) = (0, 0, 0, 0, 0);
        let ok = (x.XQueryPointer)(
            display,
            root,
            &mut root_return,
            &mut child,
            &mut root_x,
            &mut root_y,
            &mut win_x,
            &mut win_y,
            &mut mask,
        );
        (x.XCloseDisplay)(display);
        if ok == 0 {
            None
        } else {
            Some(mask & xlib::Button1Mask != 0)
        }
    }
}
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
compile_error!("DigiPet M0 supports Windows and Linux only");

#[tauri::command]
fn set_hit_regions(
    rectangles: Vec<Rect>,
    state: tauri::State<'_, Mutex<Interaction>>,
) -> Result<(), String> {
    if rectangles.len() > 256
        || rectangles.iter().any(|r| {
            ![r.x, r.y, r.width, r.height].iter().all(|v| v.is_finite())
                || r.width < 0.0
                || r.height < 0.0
        })
    {
        return Err("Invalid hit regions".into());
    }
    state.lock().map_err(|e| e.to_string())?.rectangles = rectangles;
    Ok(())
}

#[tauri::command]
fn begin_pet_gesture(
    window: WebviewWindow,
    state: tauri::State<'_, Mutex<Interaction>>,
) -> Result<bool, String> {
    if left_button_down().is_none() {
        return Ok(false);
    }
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let origin = window.outer_position().map_err(|e| e.to_string())?;
    state.lock().map_err(|e| e.to_string())?.gesture = Some(Gesture {
        cursor: (cursor.x, cursor.y),
        origin: (origin.x, origin.y),
        moved: false,
        started: Instant::now(),
    });
    Ok(true)
}

#[tauri::command]
fn cancel_pet_gesture(state: tauri::State<'_, Mutex<Interaction>>) {
    state.lock().expect("interaction mutex").gesture = None;
}

#[tauri::command]
fn resize_pet(window: WebviewWindow, expanded: bool) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let old_size = window.inner_size().map_err(|e| e.to_string())?;
    let old_position = window.outer_position().map_err(|e| e.to_string())?;
    let new_height = ((if expanded { 400.0 } else { 200.0 }) * scale).round() as u32;
    window
        .set_size(PhysicalSize::new(
            (200.0 * scale).round() as u32,
            new_height,
        ))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            old_position.x,
            old_position.y + old_size.height as i32 - new_height as i32,
        ))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn toggle_visibility(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible()? {
            window.hide()?;
        } else {
            window.show()?;
            window.set_focus()?;
        }
    }
    Ok(())
}
fn set_click_through(app: &tauri::AppHandle, enabled: bool) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        // Recover first, even if the compositor rejects future hit-testing requests.
        window.set_ignore_cursor_events(false)?;
        let state = app.state::<Mutex<Interaction>>();
        let mut state = state.lock().expect("interaction mutex");
        state.enabled = enabled && !is_wayland();
        state.ignoring = false;
    }
    Ok(())
}
fn warn(app: &tauri::AppHandle, error: impl std::fmt::Display) {
    eprintln!("DigiPet: {error}");
    let _ = app.emit("pet-warning", error.to_string());
}

pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(Interaction {
            enabled: !is_wayland(),
            ignoring: false,
            rectangles: Vec::new(),
            gesture: None,
        }))
        .invoke_handler(tauri::generate_handler![
            set_hit_regions,
            begin_pet_gesture,
            cancel_pet_gesture,
            resize_pet
        ])
        .setup(|app| {
            // Initialize shortcuts separately so an unsupported compositor cannot
            // abort the desktop shell before the tray is available.
            let shortcuts_available = if is_wayland() {
                warn(
                    app.handle(),
                    "Global shortcuts disabled on Wayland; use the tray menu.",
                );
                false
            } else {
                match app
                    .handle()
                    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
                {
                    Ok(()) => true,
                    Err(e) => {
                        warn(
                            app.handle(),
                            format!("Global shortcuts unavailable: {e}. Use the tray menu."),
                        );
                        false
                    }
                }
            };
            let show = MenuItem::with_id(app, "show", "Show / Hide", true, None::<&str>)?;
            let through = CheckMenuItem::with_id(
                app,
                "through",
                "Transparent-area click-through",
                !is_wayland(),
                !is_wayland(),
                None::<&str>,
            )?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &through, &quit])?;
            let menu_check = through.clone();
            TrayIconBuilder::with_id("digipet")
                .icon(tauri::image::Image::from_bytes(include_bytes!(
                    "../icons/32x32.png"
                ))?)
                .tooltip("DigiPet — Ctrl+Shift+P: Show/Hide; Ctrl+Shift+I: click-through")
                .menu(&menu)
                .on_menu_event(move |app, event| {
                    let result = match event.id.as_ref() {
                        "show" => toggle_visibility(app),
                        "through" => {
                            set_click_through(app, menu_check.is_checked().unwrap_or(false))
                        }
                        "quit" => {
                            app.exit(0);
                            Ok(())
                        }
                        _ => Ok(()),
                    };
                    if let Err(e) = result {
                        warn(app, e);
                    }
                })
                .build(app)?;
            let shortcut_check = through.clone();
            for (key, visibility) in [("Ctrl+Shift+P", true), ("Ctrl+Shift+I", false)]
                .into_iter()
                .filter(|_| shortcuts_available)
            {
                let check = shortcut_check.clone();
                let result = app
                    .global_shortcut()
                    .on_shortcut(key, move |app, _, event| {
                        if event.state != ShortcutState::Pressed {
                            return;
                        }
                        let result = if visibility {
                            toggle_visibility(app)
                        } else {
                            let enabled = !app
                                .state::<Mutex<Interaction>>()
                                .lock()
                                .expect("interaction mutex")
                                .enabled;
                            let result = set_click_through(app, enabled);
                            let _ = check.set_checked(enabled && !is_wayland());
                            result
                        };
                        if let Err(e) = result {
                            warn(app, e);
                        }
                    });
                // Conflicts or unsupported compositors must not prevent startup.
                if let Err(e) = result {
                    warn(
                        app.handle(),
                        format!("Hotkey {key} unavailable: {e}. Use the tray menu."),
                    );
                }
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || loop {
                std::thread::sleep(Duration::from_millis(40));
                let Some(window) = handle.get_webview_window("main") else {
                    break;
                };
                if !window.is_visible().unwrap_or(false) {
                    continue;
                }
                let (Ok(cursor), Ok(origin), Ok(scale), Ok(outer)) = (
                    window.cursor_position(),
                    window.inner_position(),
                    window.scale_factor(),
                    window.outer_position(),
                ) else {
                    continue;
                };
                let state = handle.state::<Mutex<Interaction>>();
                let mut state = state.lock().expect("interaction mutex");
                let mut clicked = false;
                if let Some(gesture) = state.gesture.as_mut() {
                    let distance = (cursor.x - gesture.cursor.0).hypot(cursor.y - gesture.cursor.1);
                    // Read native window getters before locking shared state: getters may
                    // wait on the UI thread, which also handles commands needing this mutex.
                    let window_moved = (outer.x - gesture.origin.0).abs() as f64 > 5.0 * scale
                        || (outer.y - gesture.origin.1).abs() as f64 > 5.0 * scale;
                    gesture.moved |= distance > 5.0 * scale || window_moved;
                    if left_button_down() == Some(false) {
                        clicked = !gesture.moved;
                        state.gesture = None;
                    } else if gesture.started.elapsed() > Duration::from_secs(60) {
                        state.gesture = None;
                    }
                }
                let x = (cursor.x - origin.x as f64) / scale;
                let y = (cursor.y - origin.y as f64) / scale;
                let ignore = state.enabled
                    && state.gesture.is_none()
                    && !state.rectangles.is_empty()
                    && !state.rectangles.iter().any(|r| r.contains(x, y));
                if ignore != state.ignoring {
                    match window.set_ignore_cursor_events(ignore) {
                        Ok(()) => state.ignoring = ignore,
                        Err(e) => {
                            state.enabled = false;
                            let _ = window.set_ignore_cursor_events(false);
                            state.ignoring = false;
                            warn(
                                &handle,
                                format!(
                                    "Click-through unavailable: {e}. Disabled; use tray controls."
                                ),
                            );
                        }
                    }
                }
                drop(state);
                if clicked {
                    let _ = handle.emit("pet-click", ());
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("DigiPet could not start");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hit_regions_respect_transparent_gaps_and_exclusive_edges() {
        let regions = [
            Rect {
                x: 36.0,
                y: 56.0,
                width: 16.0,
                height: 8.0,
            },
            Rect {
                x: 68.0,
                y: 56.0,
                width: 8.0,
                height: 8.0,
            },
        ];
        let hit = |x, y| regions.iter().any(|r| r.contains(x, y));
        assert!(hit(36.0, 56.0));
        assert!(hit(51.99, 63.99));
        assert!(!hit(52.0, 60.0));
        assert!(!hit(40.0, 64.0));
        assert!(!hit(-1.0, 0.0));
    }
}
