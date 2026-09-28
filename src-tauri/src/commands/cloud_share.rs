//! Public links and the comments that arrive through them.
use tauri::{AppHandle, State};

use crate::cloud::{
    api::Share,
    inbox,
    shares::{self, ShareChange, ShareInput},
    CloudState,
};
use crate::error::AppResult;

#[tauri::command]
pub async fn cloud_shares(cloud: State<'_, CloudState>, book_id: String) -> AppResult<Vec<Share>> {
    Ok(shares::list(&cloud, &book_id).await?)
}

#[tauri::command]
pub async fn cloud_share_create(app: AppHandle, input: ShareInput) -> AppResult<Share> {
    Ok(shares::create(&app, input).await?)
}

#[tauri::command]
pub async fn cloud_share_change(cloud: State<'_, CloudState>, book_id: String, id: String, change: ShareChange) -> AppResult<Share> {
    Ok(shares::change(&cloud, &book_id, &id, change).await?)
}

#[tauri::command]
pub async fn cloud_share_revoke(cloud: State<'_, CloudState>, id: String) -> AppResult<()> {
    Ok(shares::revoke(&cloud, &id).await?)
}

/// `utc_offset_min`: local minus UTC in minutes (from the webview's clock), for the note dates.
#[tauri::command]
pub async fn cloud_fetch_comments(app: AppHandle, book_id: String, utc_offset_min: i32) -> AppResult<usize> {
    Ok(inbox::fetch(&app, &book_id, utc_offset_min).await?)
}
