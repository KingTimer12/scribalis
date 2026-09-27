use tauri::AppHandle;

use crate::error::AppResult;
use crate::update::{self, UpdateInfo};

#[tauri::command]
pub async fn update_check(app: AppHandle) -> AppResult<Option<UpdateInfo>> {
    update::check(&app).await
}

/// The webview flushes pending saves before calling this: the app restarts afterwards.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> AppResult<()> {
    update::install(&app).await
}
