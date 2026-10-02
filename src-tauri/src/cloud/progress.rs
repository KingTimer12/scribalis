//! Progress of long cloud jobs (closing the app, restoring, downloading), for the webview's overlay.
use serde::Serialize;
use tauri::{AppHandle, Emitter};

pub const PROGRESS_EVENT: &str = "cloud://progress";

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub book_id: String,
    /// "checking" (book `done + 1` of `total` on close), "sending" / "downloading" (files done of
    /// total), "saving" (backing up the current state before a restore) or "swapping".
    pub step: &'static str,
    pub done: usize,
    pub total: usize,
}

pub fn emit(app: &AppHandle, book_id: &str, step: &'static str, done: usize, total: usize) {
    let _ = app.emit(PROGRESS_EVENT, Progress { book_id: book_id.to_string(), step, done, total });
}
