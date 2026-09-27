use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{AppError, AppResult};

/// Update found by the last check, kept so installing does not query the server again.
#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

/// What the webview needs to offer an update.
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

fn failed(e: impl std::fmt::Display) -> AppError {
    AppError::msg(format!("Falha na atualização: {e}"))
}

/// Asks the release endpoint for a newer signed version.
pub async fn check(app: &AppHandle) -> AppResult<Option<UpdateInfo>> {
    let update = app.updater().map_err(failed)?.check().await.map_err(failed)?;
    let info = update.as_ref().map(|u| UpdateInfo { version: u.version.clone(), notes: u.body.clone() });
    *pending(app)? = update;
    Ok(info)
}

/// Downloads, verifies and installs the pending update, then restarts.
/// On Windows the installer takes over and the process exits before returning.
pub async fn install(app: &AppHandle) -> AppResult<()> {
    let update = pending(app)?.take().ok_or_else(|| AppError::msg("Nenhuma atualização pendente"))?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(failed)?;
    app.restart()
}

fn pending(app: &AppHandle) -> AppResult<std::sync::MutexGuard<'_, Option<Update>>> {
    app.state::<PendingUpdate>().inner().0.lock().map_err(|_| AppError::msg("Estado de atualização indisponível"))
}
