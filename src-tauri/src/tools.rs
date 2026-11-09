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
    protected(
        state,
        || {
            Engine::open(
                app.path()
                    .app_local_data_dir()
                    .map_err(|_| "Storage unavailable")?
                    .join("tools"),
            )
        },
        f,
    )
}
fn protected<T>(
    state: &Tools,
    initialize: impl FnOnce() -> Result<Engine, String>,
    f: impl FnOnce(&mut Engine) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.0.lock().map_err(|_| "Tool state unavailable")?;
    // Initialization and execution are both isolated; a failed task never poisons the mutex.
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        if guard.is_none() {
            *guard = Some(initialize()?);
        }
        f(guard.as_mut().ok_or("Tool state unavailable")?)
    })) {
        Ok(result) => result,
        Err(_) => {
            *guard = None;
            Err("Backend task failed; retry or repair local tools".into())
        }
    }
}

#[tauri::command]
pub fn tool_registry() -> Value {
    digipet_tools::registry()
}
fn change_grant(
    e: &mut Engine,
    tool: &str,
    enabled: bool,
    folder: Option<std::path::PathBuf>,
) -> Result<(), String> {
    if e.has_pending_writes() {
        return Err("Resolve pending writes before changing access".into());
    }
    if enabled
        && ["report", "coding", "file_search"].contains(&tool)
        && folder.is_none()
        && !e
            .grants()
            .folders
            .get(tool)
            .is_some_and(|folders| !folders.is_empty())
    {
        return Err("Choose an allowed folder before enabling this file tool".into());
    }
    e.grant(tool, enabled, folder)
}

#[tauri::command]
pub async fn tool_grants(app: tauri::AppHandle) -> Result<Grants, String> {
    tauri::async_runtime::spawn_blocking(move || {
        engine(&app, &app.state::<Tools>(), |e| Ok(e.grants()))
    })
    .await
    .map_err(|_| "Backend task failed; retry local tools")?
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
            change_grant(e, &tool, enabled, folder)
        })
    })
    .await
    .map_err(|_| "Folder selection failed")?
}
#[tauri::command]
pub async fn tool_run(
    app: tauri::AppHandle,
    tool: String,
    arguments: Value,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        engine(&app, &app.state::<Tools>(), |e| e.run(&tool, arguments))
    })
    .await
    .map_err(|_| "Backend task failed; retry local tools")?
}

#[tauri::command]
pub async fn tool_confirm(
    app: tauri::AppHandle,
    token: String,
    approved: bool,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        engine(&app, &app.state::<Tools>(), |e| e.confirm(&token, approved))
    })
    .await
    .map_err(|_| "Backend task failed; retry local tools")?
}

#[tauri::command]
pub async fn tool_cancel(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        engine(&app, &app.state::<Tools>(), |e| {
            e.cancel();
            Ok(())
        })
    })
    .await
    .map_err(|_| "Backend task failed; retry local tools")?
}

#[tauri::command]
pub async fn tool_reminders(app: tauri::AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        engine(&app, &app.state::<Tools>(), |e| {
            Ok(serde_json::json!(e.reminders(
                &chrono::Utc::now().format("%Y%m%dT%H%M%SZ").to_string()
            )))
        })
    })
    .await
    .map_err(|_| "Backend task failed; retry local tools")?
}

#[tauri::command]
pub async fn tool_revoke_folder(
    app: tauri::AppHandle,
    tool: String,
    folder: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        engine(&app, &app.state::<Tools>(), |e| {
            if e.has_pending_writes() {
                return Err("Resolve pending writes before changing access".into());
            }
            e.revoke_folder(&tool, folder.into())
        })
    })
    .await
    .map_err(|_| "Backend task failed; retry local tools")?
}

#[tauri::command]
pub async fn tool_repair(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<Tools>();
        let mut guard = state.0.lock().unwrap_or_else(|p| p.into_inner());
        if guard.as_ref().is_some_and(|e| e.has_pending_writes()) {
            return Err("Resolve pending writes before repair".into());
        }
        let dir = app
            .path()
            .app_local_data_dir()
            .map_err(|_| "Storage unavailable")?
            .join("tools");
        Engine::repair(dir)?;
        *guard = None;
        state.0.clear_poison();
        Ok(())
    })
    .await
    .map_err(|_| "Backend repair failed")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ui_file_grants_require_a_folder_and_permission_changes_preserve_pending_approval() {
        let root = std::env::temp_dir().join(format!("digipet-access-{}", uuid::Uuid::new_v4()));
        let folder = root.join("project");
        std::fs::create_dir_all(&folder).unwrap();
        let mut engine = Engine::open(root.join("data")).unwrap();
        for tool in ["report", "coding", "file_search"] {
            assert!(change_grant(&mut engine, tool, true, None).is_err());
            assert!(!engine.grants().tools.contains(tool));
        }
        let pending = engine.run("calendar", serde_json::json!({"action":"create","title":"Review first","text":"body","date":"20261109T090000Z"})).unwrap();
        assert!(change_grant(&mut engine, "report", true, Some(folder.clone())).is_err());
        assert!(engine.has_pending_writes());
        engine
            .confirm(pending["preview"]["token"].as_str().unwrap(), false)
            .unwrap();
        change_grant(&mut engine, "report", true, Some(folder.clone())).unwrap();
        assert!(
            engine.grants().folders["report"].contains(&std::fs::canonicalize(&folder).unwrap())
        );
        change_grant(&mut engine, "calendar", false, None).unwrap();
        drop(engine);
        assert!(!Engine::open(root.join("data"))
            .unwrap()
            .grants()
            .tools
            .contains("calendar"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn task_and_initialization_panics_are_recoverable_without_losing_persisted_grants() {
        let path = std::env::temp_dir().join(format!("digipet-panic-{}", uuid::Uuid::new_v4()));
        let state = Tools::default();
        let open = || Engine::open(path.clone());
        protected(&state, open, |engine| engine.grant("journal", true, None)).unwrap();
        let failure = protected::<()>(&state, open, |_| panic!("simulated task panic"));
        assert!(failure.is_err());
        assert!(!state.0.is_poisoned());
        assert!(protected(&state, open, |e| Ok(e.grants()))
            .unwrap()
            .tools
            .contains("journal"));
        *state.0.lock().unwrap() = None;
        assert!(protected::<()>(&state, || panic!("simulated init panic"), |_| Ok(())).is_err());
        assert!(protected(&state, open, |e| Ok(e.grants()))
            .unwrap()
            .tools
            .contains("journal"));
        drop(state);
        std::fs::remove_dir_all(path).unwrap();
    }
}
