mod api;
mod tools;
mod updates;
use serde::{Deserialize, Serialize};
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
compile_error!("DigiPet supports Windows and Linux only");

#[tauri::command]
fn set_hit_regions(
    rectangles: Vec<Rect>,
    state: tauri::State<'_, Mutex<Interaction>>,
) -> Result<(), String> {
    if rectangles.len() > 8195
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
fn cancel_pet_gesture(window: WebviewWindow, state: tauri::State<'_, Mutex<Interaction>>) {
    state.lock().expect("interaction mutex").gesture = None;
    let _ = window.emit("pet-moving", false);
}

#[derive(Clone, Copy, Debug, Deserialize)]
struct SurfaceSize {
    width: f64,
    height: f64,
}
#[derive(Clone, Copy, Debug, Serialize)]
struct SurfaceLimits {
    width: f64,
    height: f64,
}

#[tauri::command]
fn get_pet_surface_limits(window: WebviewWindow) -> Result<SurfaceLimits, String> {
    surface_limits(&window)
}
fn surface_limits(window: &WebviewWindow) -> Result<SurfaceLimits, String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(window.primary_monitor().map_err(|e| e.to_string())?);
    let (width, height) = monitor
        .map(|m| {
            (
                m.work_area().size.width as f64 / scale,
                m.work_area().size.height as f64 / scale,
            )
        })
        .unwrap_or((1280.0, 960.0));
    Ok(SurfaceLimits {
        width: (width - 32.0).floor().max(200.0),
        height: (height - 240.0).floor().clamp(160.0, 960.0),
    })
}
fn measured_surface_size(
    surface: SurfaceSize,
    limits: SurfaceLimits,
    scale: f64,
) -> Result<PhysicalSize<u32>, String> {
    if !surface.width.is_finite()
        || !surface.height.is_finite()
        || surface.width < 200.0
        || surface.height < 224.0
    {
        return Err("Invalid secondary surface dimensions".into());
    }
    Ok(PhysicalSize::new(
        (surface.width.min(limits.width + 16.0) * scale).round() as u32,
        (surface.height.min(limits.height + 224.0) * scale).round() as u32,
    ))
}
#[tauri::command]
fn resize_pet(
    window: WebviewWindow,
    expanded: bool,
    managing: bool,
    surface: Option<SurfaceSize>,
) -> Result<(), String> {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let old_size = window.inner_size().map_err(|e| e.to_string())?;
    let old_position = window.outer_position().map_err(|e| e.to_string())?;
    let new_size = if expanded && managing {
        measured_surface_size(
            surface.unwrap_or(SurfaceSize {
                width: 976.0,
                height: 824.0,
            }),
            surface_limits(&window)?,
            scale,
        )?
    } else {
        pet_window_size(expanded, managing, scale)
    };
    window.set_size(new_size).map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(
            old_position.x,
            anchored_resize_y(old_position.y, old_size.height, new_size.height),
        ))
        .map_err(|e| e.to_string())?;
    recover_position(&window)?;
    Ok(())
}

fn anchored_resize_y(old_y: i32, old_height: u32, new_height: u32) -> i32 {
    old_y
        .saturating_add(old_height as i32)
        .saturating_sub(new_height as i32)
}

// CSS stage sizes; the pet stays at left=36 and bottom=16 in every surface.
fn pet_window_size(expanded: bool, managing: bool, scale: f64) -> PhysicalSize<u32> {
    let (width, height) = if expanded && managing {
        (976.0, 824.0)
    } else if expanded {
        (320.0, 456.0)
    } else {
        (200.0, 200.0)
    };
    PhysicalSize::new(
        (width * scale).round() as u32,
        (height * scale).round() as u32,
    )
}

// Only this fixed application-owned file is accessed. Pack data never reaches Rust.
fn position_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    app.path()
        .app_config_dir()
        .ok()
        .map(|p| p.join("position-v1.txt"))
}
fn clamp_axis(value: i32, start: i32, extent: u32, size: u32) -> i32 {
    let end = (start as i64 + extent as i64 - size as i64)
        .max(start as i64)
        .min(i32::MAX as i64) as i32;
    value.clamp(start, end)
}

fn parse_position(text: &str) -> Option<(i32, i32)> {
    if text.len() > 64 {
        return None;
    }
    let mut values = text.split_whitespace();
    let x = values.next()?.parse().ok()?;
    let bottom = values.next()?.parse().ok()?;
    if values.next().is_some() {
        return None;
    }
    Some((x, bottom))
}

fn recover_position(window: &WebviewWindow) -> Result<(), String> {
    if is_wayland() {
        return Ok(());
    }
    let p = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let monitors = window.available_monitors().map_err(|e| e.to_string())?;
    let anchor_x = p.x.saturating_add((100.0 * scale) as i32);
    let anchor_y =
        p.y.saturating_add(size.height as i32)
            .saturating_sub((80.0 * scale) as i32);
    // Select by the pet anchor, not the expanded bubble's top-left corner.
    let Some(monitor) = monitors.iter().min_by_key(|m| {
        let origin = m.position();
        let bounds = m.size();
        let x = clamp_axis(anchor_x, origin.x, bounds.width, 1);
        let y = clamp_axis(anchor_y, origin.y, bounds.height, 1);
        let dx = anchor_x as i128 - x as i128;
        let dy = anchor_y as i128 - y as i128;
        dx * dx + dy * dy
    }) else {
        return Ok(());
    };
    let work_area = monitor.work_area();
    let origin = &work_area.position;
    let bounds = &work_area.size;
    window
        .set_position(PhysicalPosition::new(
            clamp_axis(p.x, origin.x, bounds.width, size.width),
            clamp_axis(p.y, origin.y, bounds.height, size.height),
        ))
        .map_err(|e| e.to_string())
}

fn restore_position(window: &WebviewWindow) {
    if is_wayland() {
        return;
    }
    let result = (|| -> Result<(), String> {
        if let Some(path) = position_path(window.app_handle()) {
            // Bound the read as well as the parser for corrupted local settings.
            if let Ok(file) = std::fs::File::open(path) {
                use std::io::Read;
                let mut text = String::new();
                if file.take(65).read_to_string(&mut text).is_ok() {
                    if let Some((x, bottom)) = parse_position(&text) {
                        let height = window.outer_size().map_err(|e| e.to_string())?.height;
                        window
                            .set_position(PhysicalPosition::new(
                                x,
                                bottom.saturating_sub(height as i32),
                            ))
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        recover_position(window)
    })();
    if let Err(e) = result {
        warn(window.app_handle(), e);
    }
}

static POSITION_WRITE: Mutex<()> = Mutex::new(());

fn persist_position(app: &tauri::AppHandle, position: (i32, i32)) -> Result<(), String> {
    let _guard = POSITION_WRITE.lock().map_err(|e| e.to_string())?;
    let path = position_path(app).ok_or("No application config directory")?;
    let parent = path.parent().ok_or("No config parent")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, format!("{} {}", position.0, position.1))
        .map_err(|e| e.to_string())?;
    std::fs::rename(temporary, path).map_err(|e| e.to_string())
}

fn toggle_visibility(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible()? {
            window.hide()?;
        } else {
            let _ = recover_position(&window);
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(tools::Tools::default())
        .manage(api::Requests::default())
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
            resize_pet,
            get_pet_surface_limits,
            updates::check_for_update,
            updates::open_release_page,
            api::save_api_credential,
            api::remove_api_credential,
            api::redact_chat_text,
            api::redact_export_text,
            api::api_reply,
            api::stop_api_reply,
            api::api_tool_turn,
            tools::tool_registry,
            tools::tool_repair, tools::tool_grants, tools::tool_grant, tools::tool_revoke_folder,
            tools::tool_run, tools::tool_confirm, tools::tool_cancel, tools::tool_reminders
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
                            if let Some(w) = app.get_webview_window("main") {
                                if !is_wayland() {
                                    if let (Ok(p), Ok(s)) = (w.outer_position(), w.outer_size()) {
                                        if let Err(e) = persist_position(app, (p.x, p.y.saturating_add(s.height as i32))) { warn(app, e); }
                                    }
                                }
                            }
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
            if let Some(window) = app.get_webview_window("main") {
                restore_position(&window);
            }
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut last_position = None;
                let mut saved_position = None;
                let mut settled = Instant::now();
                loop {
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
                    if !is_wayland() {
                        if let Ok(size) = window.outer_size() {
                            let position = (outer.x, outer.y.saturating_add(size.height as i32));
                            if last_position != Some(position) {
                                last_position = Some(position);
                                settled = Instant::now();
                            } else if saved_position != Some(position)
                                && settled.elapsed() > Duration::from_millis(500)
                            {
                                if let Err(e) = persist_position(&handle, position) {
                                    warn(&handle, e);
                                }
                                saved_position = Some(position);
                            }
                        }
                    }
                    let state = handle.state::<Mutex<Interaction>>();
                    let mut state = state.lock().expect("interaction mutex");
                    let mut clicked = false;
                    let mut moving_event = None;
                    if let Some(gesture) = state.gesture.as_mut() {
                        let distance = (cursor.x - gesture.cursor.0).hypot(cursor.y - gesture.cursor.1);
                        // Read native window getters before locking shared state: getters may
                        // wait on the UI thread, which also handles commands needing this mutex.
                        let window_moved = (outer.x as i64 - gesture.origin.0 as i64).abs() as f64 > 5.0 * scale
                            || (outer.y as i64 - gesture.origin.1 as i64).abs() as f64 > 5.0 * scale;
                        let was_moved = gesture.moved;
                        gesture.moved |= distance > 5.0 * scale || window_moved;
                        if gesture.moved && !was_moved {
                            moving_event = Some(true);
                        }
                        if left_button_down() == Some(false) {
                            clicked = !gesture.moved;
                            if gesture.moved {
                                moving_event = Some(false);
                            }
                            state.gesture = None;
                        } else if gesture.started.elapsed() > Duration::from_secs(60) {
                            moving_event = Some(false);
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
                    if let Some(moving) = moving_event {
                        let _ = handle.emit("pet-moving", moving);
                    }
                    if clicked {
                        let _ = handle.emit("pet-click", ());
                    }
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
    fn surface_sizes_keep_the_pet_anchor_and_recover_at_screen_edges_across_dpi() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let idle = pet_window_size(false, false, scale);
            assert_eq!(idle.width, (200.0 * scale).round() as u32);
            let bottom = (900.0 * scale).round() as i32;
            let pet_y = bottom - (80.0 * scale).round() as i32;
            for (expanded, managing, logical_width, logical_height) in [
                (true, false, 320.0, 456.0),
                (true, true, 976.0, 824.0),
                (false, true, 200.0, 200.0),
            ] {
                let size = pet_window_size(expanded, managing, scale);
                assert_eq!(size.width, (logical_width * scale).round() as u32);
                assert_eq!(size.height, (logical_height * scale).round() as u32);
                let y = anchored_resize_y(bottom - idle.height as i32, idle.height, size.height);
                assert_eq!(
                    y + size.height as i32 - (80.0 * scale).round() as i32,
                    pet_y
                );
                let screen_width = (1920.0 * scale).round() as u32;
                let recovered_x = clamp_axis(screen_width as i32, 0, screen_width, size.width);
                assert_eq!(recovered_x + size.width as i32, screen_width as i32);
            }
        }
    }
    #[test]
    fn measured_surfaces_grow_with_content_and_clamp_to_monitor_limits_across_dpi() {
        for scale in [1.0, 1.25, 1.5, 2.0] {
            let limits = SurfaceLimits {
                width: 960.0,
                height: 640.0,
            };
            let short = measured_surface_size(
                SurfaceSize {
                    width: 776.0,
                    height: 560.0,
                },
                limits,
                scale,
            )
            .unwrap();
            let tall = measured_surface_size(
                SurfaceSize {
                    width: 976.0,
                    height: 1200.0,
                },
                limits,
                scale,
            )
            .unwrap();
            assert!(short.height < tall.height);
            assert_eq!(tall.width, (976.0 * scale).round() as u32);
            assert_eq!(tall.height, (864.0 * scale).round() as u32);
            let y = anchored_resize_y(100, short.height, tall.height);
            assert_eq!(y + tall.height as i32, 100 + short.height as i32);
        }
        for width in [f64::NAN, f64::INFINITY, -1.0, 0.0] {
            assert!(measured_surface_size(
                SurfaceSize {
                    width,
                    height: 600.0
                },
                SurfaceLimits {
                    width: 960.0,
                    height: 640.0
                },
                1.0
            )
            .is_err());
        }
    }
    #[test]
    fn position_parser_rejects_corrupt_settings_and_preserves_negative_origins() {
        assert_eq!(parse_position("-1800 900"), Some((-1800, 900)));
        assert_eq!(parse_position(" 12 -40\n"), Some((12, -40)));
        for text in ["", "hello", "1 2 3", "2147483648 2", "1", "NaN 2"] {
            assert_eq!(parse_position(text), None);
        }
        assert_eq!(parse_position(&"0".repeat(65)), None);
    }
    #[test]
    fn screen_clamp_handles_negative_monitors_and_oversized_windows() {
        assert_eq!(clamp_axis(-1800, -1920, 1920, 200), -1800);
        assert_eq!(clamp_axis(5000, 0, 1920, 200), 1720);
        assert_eq!(clamp_axis(-9999, 0, 1920, 200), 0);
        assert_eq!(clamp_axis(20, 0, 100, 200), 0);
    }
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
