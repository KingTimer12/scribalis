//! Backup of every changed book while the window closes, with a report the webview shows.
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::{
    backup::{self, Outcome},
    progress, CloudState,
};
use crate::ids::now_ms;

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CloseReport {
    /// Books whose changes reached the server.
    pub sent: usize,
    pub failed: Vec<CloseFailure>,
    /// The time cap ran out before every book was done.
    pub timed_out: bool,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CloseFailure {
    pub book_id: String,
    pub message: String,
}

/// Why an automatic run was skipped, when that means the book did not reach the server.
fn skip_reason(paused: Option<&str>, retry_at: u64, now: u64) -> Option<String> {
    if let Some(reason) = paused {
        return Some(format!("Backup pausado: {reason}."));
    }
    (now < retry_at).then(|| "O servidor pediu uma pausa. Tente de novo em instantes.".to_string())
}

/// Backs up every enabled book that changed, filling `report` as it goes so a timeout keeps what
/// was done. A book whose backup is already running (the scheduler started it just before the
/// window closed) is waited for, then checked again: an unchanged book answers at once.
/// `manual` ("Tentar de novo") ignores the session pause and asks the server even when unchanged.
pub async fn run(app: &AppHandle, manual: bool, report: &mut CloseReport) {
    let cloud = app.state::<CloudState>();
    let ids = match cloud.lock() {
        Ok(g) if g.file.has_vault() => g.file.enabled_books(),
        _ => return,
    };
    for (i, id) in ids.iter().enumerate() {
        progress::emit(app, id, "checking", i, ids.len());
        // Never hold the lock across the sleep.
        while cloud.lock().map(|g| g.running.contains(id)).unwrap_or(false) {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        let message = match backup::run(app, id, manual).await {
            Ok(Outcome::Sent) => {
                report.sent += 1;
                None
            }
            Ok(Outcome::Unchanged) => None,
            Ok(Outcome::Skipped) => cloud
                .lock()
                .ok()
                .and_then(|g| skip_reason(g.paused.as_deref(), g.retry_at, now_ms())),
            Err(e) => Some(e.message),
        };
        if let Some(message) = message {
            report.failed.push(CloseFailure { book_id: id.clone(), message });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pause_or_a_retry_time_is_a_failure_and_the_rest_is_not() {
        assert_eq!(skip_reason(Some("sem espaço"), 0, 5).as_deref(), Some("Backup pausado: sem espaço."));
        assert!(skip_reason(None, 10, 5).is_some());
        assert_eq!(skip_reason(None, 10, 20), None);
    }
}
