//! Per-book backup: state, toggle, manual run, the server's snapshot list and removal.
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::cloud::{
    api::{BookDetail, Snapshot},
    backup, restore, CloudState,
};
use crate::error::{AppError, AppResult};
use crate::model::views::{BookMeta, BookSummary};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookCloudView {
    pub enabled: bool,
    pub last_backup_at: Option<u64>,
    /// Why automatic backups stopped this session, if they did.
    pub paused: Option<String>,
    /// When "Buscar comentários" last ran for this book, shown next to the button.
    pub last_comments_at: Option<u64>,
}

fn view(cloud: &CloudState, book_id: &str) -> AppResult<BookCloudView> {
    let g = cloud.lock()?;
    let b = g.file.book(book_id);
    Ok(BookCloudView {
        enabled: b.is_some_and(|b| b.enabled),
        last_backup_at: b.and_then(|b| b.last_backup_at),
        paused: g.paused.clone(),
        last_comments_at: b.and_then(|b| b.last_comments_at),
    })
}

#[tauri::command]
pub async fn cloud_book_state(cloud: State<'_, CloudState>, book_id: String) -> AppResult<BookCloudView> {
    view(&cloud, &book_id)
}

/// Turning it on runs the first backup right away; turning it off keeps what is on the server.
#[tauri::command]
pub async fn cloud_set_enabled(app: AppHandle, book_id: String, enabled: bool) -> AppResult<BookCloudView> {
    let cloud = app.state::<CloudState>();
    if enabled && !cloud.lock()?.file.has_vault() {
        return Err(AppError::msg("Ative a nuvem primeiro."));
    }
    cloud.edit(|f| f.book_mut(&book_id).enabled = enabled)?;
    if enabled {
        backup::run(&app, &book_id, true).await?;
    }
    view(&cloud, &book_id)
}

/// `manual`: "Fazer backup agora". Otherwise an automatic run (leaving the book), silent when disabled.
#[tauri::command]
pub async fn cloud_backup(app: AppHandle, book_id: String, manual: bool) -> AppResult<BookCloudView> {
    let cloud = app.state::<CloudState>();
    let enabled = cloud.lock()?.file.book(&book_id).is_some_and(|b| b.enabled);
    if !enabled {
        if manual {
            return Err(AppError::msg("Ative o backup desta obra primeiro."));
        }
        return view(&cloud, &book_id);
    }
    backup::run(&app, &book_id, manual).await?;
    view(&cloud, &book_id)
}

#[tauri::command]
pub async fn cloud_snapshots(cloud: State<'_, CloudState>, book_id: String) -> AppResult<Vec<Snapshot>> {
    match cloud.vault_client()?.get::<BookDetail>(&format!("/books/{book_id}")).await {
        Ok(detail) => Ok(detail.snapshots),
        Err(e) if e.status == 404 => Ok(Vec::new()),
        Err(e) => Err(e.into()),
    }
}

/// "Apagar da nuvem": the book, its backups and its links leave the server.
#[tauri::command]
pub async fn cloud_forget_book(cloud: State<'_, CloudState>, book_id: String) -> AppResult<BookCloudView> {
    cloud.vault_client()?.delete(&format!("/books/{book_id}")).await?;
    cloud.edit(|f| {
        f.server_mut().books.remove(&book_id);
    })?;
    cloud.lock()?.sent.remove(&book_id);
    view(&cloud, &book_id)
}

/// Called by the webview while the window closes: at most 10 seconds of backup.
#[tauri::command]
pub async fn cloud_backup_on_close(app: AppHandle) -> AppResult<()> {
    let _ = tokio::time::timeout(Duration::from_secs(10), backup::run_all_changed_on_close(&app)).await;
    Ok(())
}

#[tauri::command]
pub async fn cloud_restore(app: AppHandle, book_id: String, snapshot_id: String) -> AppResult<BookMeta> {
    let (dir, meta) = restore::restore(&app, &book_id, &snapshot_id).await?;
    Ok(BookMeta::from_meta(&dir, &meta))
}

#[tauri::command]
pub async fn cloud_download(app: AppHandle, book_id: String) -> AppResult<BookSummary> {
    let (dir, meta) = restore::download_new(&app, &book_id).await?;
    Ok(BookSummary { cloud: true, ..crate::ops::library::summarize(&dir, &meta).0 })
}
