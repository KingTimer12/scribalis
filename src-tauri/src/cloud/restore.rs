//! Restore a backup over a book, or download a book that is only on the server.
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::{
    api::{BookDetail, RemoteFile, SnapshotFiles},
    backup,
    client::Client,
    crypto::{self, VaultKey},
    error::{CloudError, CloudResult},
    manifest::{hash_file, verify_staged},
    progress,
    swap, CloudState,
};
use crate::model::metadata::Metadata;
use crate::state::{lock, SharedLibrary};
use crate::storage::{
    metadata_io::read_metadata,
    paths::{safe_join, slugify, unique_dir, META_FILE},
};

/// Opens a sealed blob in place, leaving plain files (open books, older backups) untouched. Returns the
/// hash of what is now on disk, which is what the pre-swap check compares against.
fn unseal_in_place(to: &Path, blob_hash: &str, key: Option<&VaultKey>) -> CloudResult<String> {
    let blob = std::fs::read(to)?;
    if !crypto::is_sealed(&blob) {
        return Ok(blob_hash.to_string());
    }
    let plain = crypto::open(key, &blob)?;
    std::fs::write(to, &plain)?;
    Ok(hash_file(to)?)
}

/// Downloads every file of the snapshot into `staging`, checks each hash as it lands, decrypts sealed
/// files, and returns the manifest (with the hashes of the decrypted files) so the caller can re-verify
/// staging right before the swap. The flag tells whether any file came sealed.
async fn download_snapshot(app: &AppHandle, client: &Client, book_id: &str, snapshot_id: &str, staging: &Path) -> CloudResult<(Vec<RemoteFile>, bool)> {
    let listing: SnapshotFiles = client.get(&format!("/books/{book_id}/snapshots/{snapshot_id}")).await?;
    let key = app.state::<CloudState>().vault_key()?;
    let total = listing.files.len();
    let mut on_disk = Vec::with_capacity(total);
    let mut sealed = false;
    for (i, file) in listing.files.iter().enumerate() {
        progress::emit(app, book_id, "downloading", i, total);
        let to = safe_join(staging, &file.path)?;
        if let Some(parent) = to.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        client.download(&format!("/blobs/{}", file.hash), &to).await?;
        if hash_file(&to)? != file.hash {
            return Err(CloudError::new("hash_mismatch", "Um arquivo do backup chegou corrompido. Nada foi alterado."));
        }
        let hash = unseal_in_place(&to, &file.hash, key.as_ref())?;
        sealed |= hash != file.hash;
        on_disk.push(RemoteFile { hash, ..file.clone() });
    }
    if !staging.join(META_FILE).exists() {
        return Err(CloudError::new("invalid_metadata", "O backup não tem metadata.json. Nada foi alterado."));
    }
    progress::emit(app, book_id, "downloading", total, total);
    Ok((on_disk, sealed))
}

async fn fetch_into_staging(app: &AppHandle, client: &Client, root: &Path, book_id: &str, snapshot_id: &str) -> CloudResult<(Vec<RemoteFile>, bool)> {
    swap::fresh_staging(root, book_id)?;
    let result = download_snapshot(app, client, book_id, snapshot_id, &swap::staging_dir(root, book_id)).await;
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
    let (files, _) = fetch_into_staging(app, &client, &root, book_id, snapshot_id).await?;
    progress::emit(app, book_id, "saving", 0, 0);
    if let Err(e) = backup::require_fresh_backup(backup::run(app, book_id, true).await) {
        swap::abort(&root, book_id);
        return Err(e);
    }
    verify_before_swap(&root, book_id, &files)?;
    progress::emit(app, book_id, "swapping", 0, 0);
    swap::mark_destination(&root, book_id, &dir)?;
    let meta = {
        let mut lib = lock(&libs)?;
        swap::swap_in(&root, book_id, &dir)?;
        let meta = read_metadata(&dir)?;
        let words = crate::ops::library::summarize(&dir, &meta).1;
        lib.replace(&dir, &meta.id, words);
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
    let (files, sealed) = fetch_into_staging(app, &client, &root, book_id, &snap.id).await?;
    verify_before_swap(&root, book_id, &files)?;
    progress::emit(app, book_id, "swapping", 0, 0);
    let (target, meta) = {
        let mut lib = lock(&libs)?;
        let target = unique_dir(&root, &slugify(&detail.title));
        swap::place_new(&root, book_id, &target)?;
        let meta = read_metadata(&target)?;
        let words = crate::ops::library::summarize(&target, &meta).1;
        lib.register(&target, &meta.id, words);
        (target, meta)
    };
    cloud.edit(|f| {
        let b = f.book_mut(book_id);
        b.enabled = true;
        // A backup with no sealed file was an open book (public links): it stays open.
        b.plain = !sealed;
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
        let err = backup::require_fresh_backup(Ok(backup::Outcome::Skipped)).unwrap_err();
        assert_eq!(err.code, "backup_running");
        assert_eq!(err.message, "Backup em andamento. Tente de novo em instantes.");
    }

    #[test]
    fn a_completed_backup_lets_the_restore_continue() {
        assert!(backup::require_fresh_backup(Ok(backup::Outcome::Sent)).is_ok());
        assert!(backup::require_fresh_backup(Ok(backup::Outcome::Unchanged)).is_ok());
    }

    #[test]
    fn a_backup_error_propagates_unchanged() {
        let err = backup::require_fresh_backup(Err(CloudError::network())).unwrap_err();
        assert_eq!(err.code, super::super::error::NETWORK);
    }

    #[test]
    fn sealed_files_are_opened_in_place_and_plain_ones_left_alone() {
        let dir = tempfile::tempdir().unwrap();
        let key = VaultKey::from_hex(&"cd".repeat(32)).unwrap();
        let sealed = dir.path().join("c1.md");
        std::fs::write(&sealed, crypto::seal(&key, "c1.md", b"texto")).unwrap();
        let hash = unseal_in_place(&sealed, "blob", Some(&key)).unwrap();
        assert_eq!(std::fs::read(&sealed).unwrap(), b"texto");
        assert_eq!(hash, hash_file(&sealed).unwrap());

        let plain = dir.path().join("metadata.json");
        std::fs::write(&plain, "{}").unwrap();
        assert_eq!(unseal_in_place(&plain, "same", None).unwrap(), "same");

        std::fs::write(&sealed, crypto::seal(&key, "c1.md", b"texto")).unwrap();
        assert_eq!(unseal_in_place(&sealed, "blob", None).unwrap_err().code, "wrong_key");
    }
}
