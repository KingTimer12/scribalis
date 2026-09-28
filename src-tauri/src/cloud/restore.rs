//! Restore a backup over a book, or download a book that is only on the server.
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::{
    api::{BookDetail, RemoteFile, SnapshotFiles},
    backup,
    client::Client,
    error::{CloudError, CloudResult},
    manifest::{hash_file, verify_staged},
    swap, CloudState,
};
use crate::model::metadata::Metadata;
use crate::state::{lock, SharedLibrary};
use crate::storage::{
    metadata_io::read_metadata,
    paths::{safe_join, slugify, unique_dir, META_FILE},
};

/// Downloads every file of the snapshot into `staging`, checks each hash as it lands, and returns the
/// manifest so the caller can re-verify staging right before the swap.
async fn download_snapshot(client: &Client, book_id: &str, snapshot_id: &str, staging: &Path) -> CloudResult<Vec<RemoteFile>> {
    let listing: SnapshotFiles = client.get(&format!("/books/{book_id}/snapshots/{snapshot_id}")).await?;
    for file in &listing.files {
        let to = safe_join(staging, &file.path)?;
        if let Some(parent) = to.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        client.download(&format!("/blobs/{}", file.hash), &to).await?;
        if hash_file(&to)? != file.hash {
            return Err(CloudError::new("hash_mismatch", "Um arquivo do backup chegou corrompido. Nada foi alterado."));
        }
    }
    if !staging.join(META_FILE).exists() {
        return Err(CloudError::new("invalid_metadata", "O backup não tem metadata.json. Nada foi alterado."));
    }
    Ok(listing.files)
}

async fn fetch_into_staging(client: &Client, root: &Path, book_id: &str, snapshot_id: &str) -> CloudResult<Vec<RemoteFile>> {
    swap::fresh_staging(root, book_id)?;
    let result = download_snapshot(client, book_id, snapshot_id, &swap::staging_dir(root, book_id)).await;
    if result.is_err() {
        swap::abort(root, book_id);
    }
    result
}

/// Re-checks the staging folder against the manifest right before an irreversible swap. The staging
/// folder is not locked between the download finishing and the swap running, so a crash-recovery pass
/// or a concurrent listing could have touched it in between. On any mismatch, staging is deleted.
fn verify_before_swap(root: &Path, book_id: &str, files: &[RemoteFile]) -> CloudResult<()> {
    let staging = swap::staging_dir(root, book_id);
    if let Err(e) = verify_staged(&staging, files) {
        swap::abort(root, book_id);
        return Err(CloudError::new("staging_mismatch", format!("{e} Nada foi alterado.")));
    }
    Ok(())
}

/// Turns the "backup of the current state" result into either "safe to swap" or a restore-stopping
/// error. `Skipped` means another backup of this book was already running and did not actually run
/// just now, so it is not the safe pre-restore backup the caller needs: that in-flight backup could be
/// reading the folder mid-swap, or its snapshot could predate recent edits.
fn require_fresh_backup(result: CloudResult<backup::Outcome>) -> CloudResult<()> {
    match result? {
        backup::Outcome::Skipped => {
            Err(CloudError::new("backup_running", "Backup em andamento. Tente de novo em instantes."))
        }
        _ => Ok(()),
    }
}

/// Replaces the book with the snapshot. Order matters: download and verify first, then back up the
/// current state (which may push out the oldest snapshot, possibly the one being restored), then swap.
pub async fn restore(app: &AppHandle, book_id: &str, snapshot_id: &str) -> CloudResult<(PathBuf, Metadata)> {
    let cloud = app.state::<CloudState>();
    // Bound first: a lock guard cannot borrow a temporary `State`.
    let libs = app.state::<SharedLibrary>();
    let client = cloud.vault_client()?;
    let (root, dir) = {
        let lib = lock(&libs)?;
        (lib.root.clone(), lib.dir_of(book_id)?)
    };
    let files = fetch_into_staging(&client, &root, book_id, snapshot_id).await?;
    if let Err(e) = require_fresh_backup(backup::run(app, book_id, true).await) {
        swap::abort(&root, book_id);
        return Err(e);
    }
    verify_before_swap(&root, book_id, &files)?;
    swap::mark_destination(&root, book_id, &dir)?;
    let meta = {
        let mut lib = lock(&libs)?;
        swap::swap_in(&root, book_id, &dir)?;
        let meta = read_metadata(&dir)?;
        lib.replace(&dir, &meta);
        meta
    };
    if meta.id != book_id {
        return Err(CloudError::new("book_mismatch", "O backup restaurado pertence a outra obra."));
    }
    cloud.lock()?.sent.remove(book_id);
    Ok((dir, meta))
}

/// Brings a book that exists only on the server into a new folder, keeping its id.
pub async fn download_new(app: &AppHandle, book_id: &str) -> CloudResult<(PathBuf, Metadata)> {
    let cloud = app.state::<CloudState>();
    let libs = app.state::<SharedLibrary>();
    let client = cloud.vault_client()?;
    let root = {
        let lib = lock(&libs)?;
        if lib.dir_of(book_id).is_ok() {
            return Err(CloudError::new("exists", "Esta obra já está neste computador."));
        }
        lib.root.clone()
    };
    let detail: BookDetail = client.get(&format!("/books/{book_id}")).await?;
    let snap = detail
        .snapshots
        .first()
        .cloned()
        .ok_or_else(|| CloudError::new("no_snapshot", "Esta obra não tem backup na nuvem."))?;
    std::fs::create_dir_all(&root)?;
    let files = fetch_into_staging(&client, &root, book_id, &snap.id).await?;
    verify_before_swap(&root, book_id, &files)?;
    let (target, meta) = {
        let mut lib = lock(&libs)?;
        let target = unique_dir(&root, &slugify(&detail.title));
        swap::place_new(&root, book_id, &target)?;
        let meta = read_metadata(&target)?;
        lib.register(&target, &meta);
        (target, meta)
    };
    cloud.edit(|f| {
        let b = f.book_mut(book_id);
        b.enabled = true;
        b.last_backup_at = Some(snap.created_at);
        b.last_snapshot_id = Some(snap.id.clone());
    })?;
    Ok((target, meta))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skipped_backup_stops_the_restore_with_a_clear_message() {
        let err = require_fresh_backup(Ok(backup::Outcome::Skipped)).unwrap_err();
        assert_eq!(err.code, "backup_running");
        assert_eq!(err.message, "Backup em andamento. Tente de novo em instantes.");
    }

    #[test]
    fn a_completed_backup_lets_the_restore_continue() {
        assert!(require_fresh_backup(Ok(backup::Outcome::Sent)).is_ok());
        assert!(require_fresh_backup(Ok(backup::Outcome::Unchanged)).is_ok());
    }

    #[test]
    fn a_backup_error_propagates_unchanged() {
        let err = require_fresh_backup(Err(CloudError::network())).unwrap_err();
        assert_eq!(err.code, super::super::error::NETWORK);
    }
}
