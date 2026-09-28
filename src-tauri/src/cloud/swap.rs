//! Restore swaps whole book folders. Staging folders start with `.`, so the library scan skips them,
//! and `recover` cleans up after a crash in the middle of a swap.
use std::{fs, path::{Path, PathBuf}};

use crate::error::{AppError, AppResult};

const STAGING_PREFIX: &str = ".restaurando-";
const OLD_PREFIX: &str = ".antigo-";
/// Inside the staging folder: name of the book folder it replaces.
const DEST_FILE: &str = ".destino";

pub fn staging_dir(root: &Path, id: &str) -> PathBuf {
    root.join(format!("{STAGING_PREFIX}{id}"))
}

fn old_dir(root: &Path, id: &str) -> PathBuf {
    root.join(format!("{OLD_PREFIX}{id}"))
}

/// Empty staging folder for book `id` (a leftover from an earlier attempt is discarded).
pub fn fresh_staging(root: &Path, id: &str) -> AppResult<PathBuf> {
    let staging = staging_dir(root, id);
    if staging.exists() {
        fs::remove_dir_all(&staging)?;
    }
    fs::create_dir_all(&staging)?;
    Ok(staging)
}

/// Removes the staging folder after a failed download or restore.
pub fn abort(root: &Path, id: &str) {
    let _ = fs::remove_dir_all(staging_dir(root, id));
}

/// Records which folder the staging replaces, so `recover` can undo a half swap.
pub fn mark_destination(root: &Path, id: &str, target: &Path) -> AppResult<()> {
    let name = target.file_name().ok_or_else(|| AppError::msg("Pasta da obra inválida"))?;
    fs::write(staging_dir(root, id).join(DEST_FILE), name.to_string_lossy().as_bytes())?;
    Ok(())
}

/// Book folder → `.antigo-<id>`, staging → book folder, then the old copy goes.
/// If the second rename fails, the first is undone.
pub fn swap_in(root: &Path, id: &str, target: &Path) -> AppResult<()> {
    let old = old_dir(root, id);
    if old.exists() {
        fs::remove_dir_all(&old)?;
    }
    fs::rename(target, &old)?;
    if let Err(e) = fs::rename(staging_dir(root, id), target) {
        let _ = fs::rename(&old, target);
        return Err(e.into());
    }
    let _ = fs::remove_file(target.join(DEST_FILE));
    if let Err(e) = fs::remove_dir_all(&old) {
        eprintln!("could not remove {}: {e}", old.display());
    }
    Ok(())
}

/// A downloaded book becomes a new folder.
pub fn place_new(root: &Path, id: &str, target: &Path) -> AppResult<()> {
    fs::rename(staging_dir(root, id), target)?;
    Ok(())
}

/// Cleans up after a crash mid-restore. Old copy + staging with a destination whose folder is gone:
/// the swap stopped between renames, so the old copy goes back. Old copy alone: the swap finished.
/// Staging alone: a download that never completed.
pub fn recover(root: &Path) {
    let Ok(entries) = fs::read_dir(root) else { return };
    let names: Vec<String> = entries.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
    for name in &names {
        let Some(id) = name.strip_prefix(OLD_PREFIX) else { continue };
        let old = root.join(name);
        let staging = staging_dir(root, id);
        let dest = fs::read_to_string(staging.join(DEST_FILE)).ok().map(|d| root.join(d.trim()));
        match dest {
            Some(dest) if !dest.exists() => {
                if let Err(e) = fs::rename(&old, &dest) {
                    eprintln!("could not restore {}: {e}", old.display());
                }
            }
            _ => {
                let _ = fs::remove_dir_all(&old);
            }
        }
    }
    for name in &names {
        if name.starts_with(STAGING_PREFIX) {
            let _ = fs::remove_dir_all(root.join(name));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(path: &Path, content: &str) {
        fs::create_dir_all(path).unwrap();
        fs::write(path.join("metadata.json"), content).unwrap();
    }

    fn read(path: &Path) -> String {
        fs::read_to_string(path.join("metadata.json")).unwrap()
    }

    #[test]
    fn swap_puts_staging_in_place_and_leaves_nothing_hidden() {
        let root = tempfile::tempdir().unwrap();
        let book = root.path().join("obra");
        folder(&book, "atual");
        let staging = fresh_staging(root.path(), "b1").unwrap();
        folder(&staging, "backup");
        mark_destination(root.path(), "b1", &book).unwrap();
        swap_in(root.path(), "b1", &book).unwrap();
        assert_eq!(read(&book), "backup");
        assert!(!book.join(DEST_FILE).exists());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn failed_second_rename_puts_the_book_back() {
        let root = tempfile::tempdir().unwrap();
        let book = root.path().join("obra");
        folder(&book, "atual");
        // no staging folder: the rename of staging onto the book fails
        assert!(swap_in(root.path(), "b1", &book).is_err());
        assert_eq!(read(&book), "atual");
        assert!(!root.path().join(".antigo-b1").exists());
    }

    #[test]
    fn recover_after_crash_between_renames_restores_the_old_folder() {
        let root = tempfile::tempdir().unwrap();
        folder(&root.path().join(".antigo-b1"), "atual");
        let staging = root.path().join(".restaurando-b1");
        folder(&staging, "backup");
        fs::write(staging.join(DEST_FILE), "obra").unwrap();
        recover(root.path());
        assert_eq!(read(&root.path().join("obra")), "atual");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn recover_after_crash_before_cleanup_drops_the_old_folder() {
        let root = tempfile::tempdir().unwrap();
        folder(&root.path().join("obra"), "backup");
        folder(&root.path().join(".antigo-b1"), "atual");
        recover(root.path());
        assert_eq!(read(&root.path().join("obra")), "backup");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn recover_drops_a_lone_staging_folder_and_ignores_missing_root() {
        let root = tempfile::tempdir().unwrap();
        folder(&root.path().join(".restaurando-b1"), "meio download");
        recover(root.path());
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
        recover(&root.path().join("nao-existe"));
    }

    #[test]
    fn place_new_moves_staging_to_the_target() {
        let root = tempfile::tempdir().unwrap();
        let staging = fresh_staging(root.path(), "b1").unwrap();
        folder(&staging, "backup");
        let target = root.path().join("obra-baixada");
        place_new(root.path(), "b1", &target).unwrap();
        assert_eq!(read(&target), "backup");
        assert!(!staging.exists());
    }
}
