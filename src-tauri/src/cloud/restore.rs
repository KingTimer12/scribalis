//! Restore a backup over a book, or download a book that is only on the server.
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use super::{
    api::{BookDetail, SnapshotFiles},
    backup,
    client::Client,
    error::{CloudError, CloudResult},
    manifest::hash_file,
    swap, CloudState,
};
use crate::model::metadata::Metadata;
use crate::state::{lock, SharedLibrary};
use crate::storage::{
    metadata_io::read_metadata,
    paths::{safe_join, slugify, unique_dir, META_FILE},
};

/// Downloads every file of the snapshot into `staging` and checks each hash.
async fn download_snapshot(client: &Client, book_id: &str, snapshot_id: &str, staging: &Path) -> CloudResult<()> {
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
    Ok(())
}

async fn fetch_into_staging(client: &Client, root: &Path, book_id: &str, snapshot_id: &str) -> CloudResult<()> {
    swap::fresh_staging(root, book_id)?;
    let result = download_snapshot(client, book_id, snapshot_id, &swap::staging_dir(root, book_id)).await;
    if result.is_err() {
        swap::abort(root, book_id);
    }
    result
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
    fetch_into_staging(&client, &root, book_id, snapshot_id).await?;
    // A backup already running for this book returns Skipped: it is saving the current state itself.
    if let Err(e) = backup::run(app, book_id, true).await {
        swap::abort(&root, book_id);
        return Err(e);
    }
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
    fetch_into_staging(&client, &root, book_id, &snap.id).await?;
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
