//! Commands here are UI capabilities, never model tools.
use digipet_tools::{Engine, Grants};
use serde_json::Value;
use std::sync::Mutex;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
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

// This is a DigiPet permission decision shown by the native desktop dialog.
// Calendar and Journal use app-owned JSON, not the OS calendar/contact stores.
// There is no Windows/Linux OS-calendar permission API for these local tools.
static ACCESS_SETUP: Mutex<()> = Mutex::new(());

#[tauri::command]
pub async fn tool_access_setup(app: tauri::AppHandle, force: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _setup = ACCESS_SETUP.lock().map_err(|_| "Access setup unavailable")?;
        let directory = app.path().app_config_dir().map_err(|_| "Storage unavailable")?;
        let path = directory.join("local-tool-access-v1.txt");
        if !force {
            if let Ok(file) = std::fs::File::open(&path) {
                use std::io::Read;
                let mut saved = String::new();
                file.take(32).read_to_string(&mut saved).map_err(|_| "Access setup unavailable")?;
                if matches!(saved.as_str(), "allowed" | "deferred") { return Ok("reviewed".into()); }
            }
        }
        let missing = engine(&app, &app.state::<Tools>(), |e| {
            if e.has_pending_writes() { return Err("Resolve pending writes before changing access".into()); }
            let grants = e.grants();
            Ok(["calendar", "journal"].into_iter().filter(|tool| !grants.tools.contains(*tool)).collect::<Vec<_>>())
        })?;
        let allowed = if missing.is_empty() && !force {
            true
        } else {
            let mut dialog = app.dialog().message(
                "Allow DigiPet's local Calendar and Journal tools?\nThese store records only in DigiPet's own local data, not your system calendar. Every write still needs a separate preview and confirmation. File tools stay denied until you choose allowed folders in Settings → Local tool access.\n\n允許 DigiPet 本機行事曆及日記工具？資料只存於 DigiPet 本機資料，不存取系統日曆。每次寫入仍須預覽確認；檔案工具需在設定 → 本機工具授權選擇允許資料夾。"
            ).title("DigiPet — Local tool access / 本機工具授權")
             .buttons(MessageDialogButtons::OkCancelCustom("Allow / 允許".into(), "Not now / 暫不允許".into()));
            if let Some(window) = app.get_webview_window("main") { dialog = dialog.parent(&window); }
            dialog.blocking_show()
        };
        if allowed {
            engine(&app, &app.state::<Tools>(), |e| {
                if e.has_pending_writes() { return Err("Resolve pending writes before changing access".into()); }
                for tool in missing { e.grant(tool, true, None)?; }
                Ok(())
            })?;
        }
        let status = if allowed { "allowed" } else { "deferred" };
        std::fs::create_dir_all(&directory).map_err(|_| "Access setup could not be saved")?;
        let temporary = path.with_extension("tmp");
        std::fs::write(&temporary, status).map_err(|_| "Access setup could not be saved")?;
        std::fs::rename(temporary, path).map_err(|_| "Access setup could not be saved")?;
        Ok(status.into())
    }).await.map_err(|_| "Access setup failed; retry in Settings")?
}

#[tauri::command]
pub fn tool_registry() -> Value {
    digipet_tools::registry()
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
            if e.has_pending_writes() {
                return Err("Resolve pending writes before changing access".into());
            }
            e.grant(&tool, enabled, folder)
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
