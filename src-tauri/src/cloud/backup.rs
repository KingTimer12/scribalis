//! Backup of one book: manifest → check → upload what is missing → close the snapshot.
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::{
    api::{FileRef, HashesBody, Missing, SnapshotBody, SnapshotCreated},
    client::Client,
    error::{CloudError, CloudResult, LOCAL},
    manifest::{self, Entry},
    CloudState,
};
use crate::ids::now_ms;
use crate::state::{lock, SharedLibrary};
use crate::storage::paths::safe_join;

pub const STATUS_EVENT: &str = "cloud://status";

#[derive(Debug, PartialEq)]
pub enum Policy {
    /// Try again at the next cycle.
    Offline,
    /// No automatic backup before this time (ms).
    RetryAt(u64),
    /// Stop automatic backups for the session, with this reason.
    Pause(&'static str),
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CloudStatus {
    pub book_id: String,
    /// "sending", "ok", "offline" or "error".
    pub state: &'static str,
    pub last_backup_at: Option<u64>,
    pub message: Option<String>,
}

pub enum Outcome {
    Sent(u64),
    Unchanged,
    /// Automatic backup paused, or another backup of the book already running.
    Skipped,
}

pub fn policy_for(e: &CloudError, now: u64) -> Policy {
    match e.code.as_str() {
        "too_large" | "quota_exceeded" => Policy::Pause("sem espaço"),
        "unauthorized" => Policy::Pause("chave recusada"),
        "rate_limited" => Policy::RetryAt(now + e.retry_after.unwrap_or(60) * 1000),
        _ => Policy::Offline,
    }
}

fn emit(app: &AppHandle, status: CloudStatus) {
    let _ = app.emit(STATUS_EVENT, status);
}

fn last_backup_at(cloud: &CloudState, book_id: &str) -> Option<u64> {
    cloud.lock().ok().and_then(|g| g.file.book(book_id).and_then(|b| b.last_backup_at))
}

/// Backs up `book_id`. Automatic runs skip unchanged books and respect the pause and retry time;
/// a manual run always calls the server (which answers `unchanged` for free).
pub async fn run(app: &AppHandle, book_id: &str, manual: bool) -> CloudResult<Outcome> {
    let cloud = app.state::<CloudState>();
    {
        let mut g = cloud.lock()?;
        if !manual && (g.paused.is_some() || now_ms() < g.retry_at) {
            return Ok(Outcome::Skipped);
        }
        if manual {
            g.paused = None;
        }
        if !g.running.insert(book_id.to_string()) {
            g.rerun.insert(book_id.to_string());
            return Ok(Outcome::Skipped);
        }
    }
    let mut manual = manual;
    loop {
        let result = run_once(app, &cloud, book_id, manual).await;
        let again = {
            let mut g = cloud.lock()?;
            let again = g.rerun.remove(book_id) && result.is_ok();
            if !again {
                g.running.remove(book_id);
            }
            again
        };
        report(app, &cloud, book_id, &result);
        if !again {
            return result;
        }
        manual = false;
    }
}

fn report(app: &AppHandle, cloud: &CloudState, book_id: &str, result: &CloudResult<Outcome>) {
    let status = |state, message| CloudStatus { book_id: book_id.to_string(), state, last_backup_at: last_backup_at(cloud, book_id), message };
    match result {
        Ok(Outcome::Skipped) => {}
        Ok(_) => emit(app, status("ok", None)),
        Err(e) => {
            if let Ok(mut g) = cloud.lock() {
                match policy_for(e, now_ms()) {
                    Policy::Pause(reason) => g.paused = Some(reason.to_string()),
                    Policy::RetryAt(t) => g.retry_at = t,
                    Policy::Offline => {}
                }
            }
            let state = if e.is("network") || e.is("unexpected") { "offline" } else { "error" };
            emit(app, status(state, Some(e.message.clone())));
        }
    }
}

async fn upload(client: &Client, dir: &std::path::Path, entries: &[Entry], hashes: &[String]) -> CloudResult<()> {
    // One at a time: a book changes one or two files between backups.
    for hash in hashes {
        let Some(entry) = entries.iter().find(|e| &e.hash == hash) else { continue };
        client.put_file(&format!("/blobs/{hash}"), &safe_join(dir, &entry.path)?).await?;
    }
    Ok(())
}

async fn run_once(app: &AppHandle, cloud: &CloudState, book_id: &str, manual: bool) -> CloudResult<Outcome> {
    let client = cloud.vault_client()?;
    let dir = lock(&app.state::<SharedLibrary>())?.dir_of(book_id)?;

    let mut cache = std::mem::take(&mut cloud.lock()?.hashes);
    let walk_dir = dir.clone();
    let (entries, cache) = tokio::task::spawn_blocking(move || {
        let entries = manifest::build(&walk_dir, &mut cache);
        (entries, cache)
    })
    .await
    .map_err(|_| CloudError::new(LOCAL, "Não foi possível ler a obra"))?;
    cloud.lock()?.hashes = cache;
    let entries = entries?;
    let print = manifest::fingerprint(&entries);
    if !manual && cloud.lock()?.sent.get(book_id) == Some(&print) {
        return Ok(Outcome::Unchanged);
    }

    emit(app, CloudStatus { book_id: book_id.to_string(), state: "sending", last_backup_at: last_backup_at(cloud, book_id), message: None });
    let mut hashes: Vec<String> = entries.iter().map(|e| e.hash.clone()).collect();
    hashes.sort();
    hashes.dedup();
    let missing: Missing = client.post("/blobs/check", &HashesBody { hashes: &hashes }).await?;
    upload(&client, &dir, &entries, &missing.missing).await?;

    let body = SnapshotBody { files: entries.iter().map(|e| FileRef { path: &e.path, hash: &e.hash }).collect() };
    let path = format!("/books/{book_id}/snapshots");
    let created: SnapshotCreated = match client.post(&path, &body).await {
        Err(e) if e.is("missing_blobs") => {
            upload(&client, &dir, &entries, &e.missing).await?;
            client.post(&path, &body).await?
        }
        other => other?,
    };

    let snapshot = created.snapshot;
    cloud.edit(|f| {
        let b = f.book_mut(book_id);
        b.last_backup_at = Some(snapshot.created_at);
        b.last_snapshot_id = Some(snapshot.id.clone());
    })?;
    cloud.lock()?.sent.insert(book_id.to_string(), print);
    Ok(if created.unchanged { Outcome::Unchanged } else { Outcome::Sent(snapshot.created_at) })
}

/// Automatic backup of every enabled book that changed.
pub async fn run_all_changed(app: &AppHandle) {
    let ids = match app.state::<CloudState>().lock() {
        Ok(g) if g.file.has_vault() => g.file.enabled_books(),
        _ => return,
    };
    for id in ids {
        if let Err(e) = run(app, &id, false).await {
            eprintln!("cloud backup of {id} failed: {}", e.message);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn size_and_key_problems_pause_for_the_session() {
        assert_eq!(policy_for(&CloudError::new("too_large", "x"), 0), Policy::Pause("sem espaço"));
        assert_eq!(policy_for(&CloudError::new("quota_exceeded", "x"), 0), Policy::Pause("sem espaço"));
        assert_eq!(policy_for(&CloudError::new("unauthorized", "x"), 0), Policy::Pause("chave recusada"));
    }

    #[test]
    fn rate_limit_waits_and_the_rest_retries_next_cycle() {
        let mut e = CloudError::new("rate_limited", "x");
        e.retry_after = Some(30);
        assert_eq!(policy_for(&e, 1_000), Policy::RetryAt(31_000));
        assert_eq!(policy_for(&CloudError::network(), 0), Policy::Offline);
        assert_eq!(policy_for(&CloudError::new("unexpected", "x"), 0), Policy::Offline);
    }
}
