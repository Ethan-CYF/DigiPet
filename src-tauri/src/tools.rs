//! Commands here are UI capabilities, never model tools.
use digipet_tools::{Engine, Grants};
use serde_json::Value;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
#[derive(Default)]
pub struct Tools(pub Mutex<Option<Engine>>);
fn engine<T>(
    app: &tauri::AppHandle,
    state: &Tools,
    f: impl FnOnce(&mut Engine) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.0.lock().map_err(|_| "Tool state unavailable")?;
    if guard.is_none() {
        *guard = Some(Engine::open(
            app.path()
                .app_local_data_dir()
                .map_err(|_| "Storage unavailable")?
                .join("tools"),
        )?);
    }
    f(guard.as_mut().ok_or("Tool state unavailable")?)
}
#[tauri::command]
pub fn tool_registry() -> Value {
    digipet_tools::registry()
}
#[tauri::command]
pub fn tool_grants(
    app: tauri::AppHandle,
    state: tauri::State<'_, Tools>,
) -> Result<Grants, String> {
    engine(&app, &state, |e| Ok(e.grants()))
}
#[tauri::command]
pub async fn tool_grant(
    app: tauri::AppHandle,
    tool: String,
    enabled: bool,
    pick_folder: bool,
) -> Result<(), String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let folder = if enabled && pick_folder {
            Some(
                handle
                    .dialog()
                    .file()
                    .blocking_pick_folder()
                    .ok_or("Folder selection cancelled")?
                    .into_path()
                    .map_err(|_| "Invalid folder")?,
            )
        } else {
            None
        };
        engine(&handle, &handle.state::<Tools>(), |e| {
            e.grant(&tool, enabled, folder)
        })
    })
    .await
    .map_err(|_| "Folder selection failed")?
}
#[tauri::command]
pub fn tool_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, Tools>,
    tool: String,
    arguments: Value,
) -> Result<Value, String> {
    engine(&app, &state, |e| e.run(&tool, arguments))
}
#[tauri::command]
pub fn tool_confirm(
    app: tauri::AppHandle,
    state: tauri::State<'_, Tools>,
    token: String,
    approved: bool,
) -> Result<Value, String> {
    engine(&app, &state, |e| e.confirm(&token, approved))
}
#[tauri::command]
pub fn tool_cancel(app: tauri::AppHandle, state: tauri::State<'_, Tools>) -> Result<(), String> {
    engine(&app, &state, |e| {
        e.cancel();
        Ok(())
    })
}
#[tauri::command]
pub fn tool_reminders(
    app: tauri::AppHandle,
    state: tauri::State<'_, Tools>,
) -> Result<Value, String> {
    engine(&app, &state, |e| {
        Ok(serde_json::json!(e.reminders(
            &chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string()
        )))
    })
}

#[tauri::command]
pub fn tool_revoke_folder(
    app: tauri::AppHandle,
    state: tauri::State<'_, Tools>,
    tool: String,
    folder: String,
) -> Result<(), String> {
    engine(&app, &state, |e| e.revoke_folder(&tool, folder.into()))
}
