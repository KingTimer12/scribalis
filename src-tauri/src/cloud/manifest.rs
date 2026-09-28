//! Lists a book folder with the SHA-256 of each file, as the backup sends it.
use std::{collections::HashMap, fs, io::{self, Read}, path::{Path, PathBuf}, time::SystemTime};

use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::storage::paths::{safe_join, META_FILE};

use super::api::RemoteFile;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// Relative to the book folder, with `/`.
    pub path: String,
    pub hash: String,
    pub size: u64,
}

/// Hashes by (path, size, modified time): unchanged files are not read again.
#[derive(Default)]
pub struct HashCache(HashMap<PathBuf, (u64, SystemTime, String)>);

/// Dot names (`.DS_Store`, restore staging) and atomic-write leftovers never go to the server.
fn skipped(name: &str) -> bool {
    name.starts_with('.') || name.ends_with(".tmp")
}

/// SHA-256 as lowercase hex, reading in blocks so big images never sit whole in memory.
pub fn hash_file(path: &Path) -> io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn build(dir: &Path, cache: &mut HashCache) -> AppResult<Vec<Entry>> {
    let mut out = Vec::new();
    walk(dir, "", cache, &mut out)?;
    if !out.iter().any(|e| e.path == META_FILE) {
        return Err(AppError::msg("A obra não tem metadata.json"));
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn walk(dir: &Path, prefix: &str, cache: &mut HashCache, out: &mut Vec<Entry>) -> AppResult<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if skipped(&name) {
            continue;
        }
        let rel = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        // DirEntry::metadata does not follow symlinks: links are neither files nor folders here.
        let meta = entry.metadata()?;
        if meta.is_dir() {
            walk(&entry.path(), &rel, cache, out)?;
        } else if meta.is_file() {
            let path = entry.path();
            let (size, modified) = (meta.len(), meta.modified()?);
            let hash = match cache.0.get(&path) {
                Some((s, m, h)) if *s == size && *m == modified => h.clone(),
                _ => {
                    let h = hash_file(&path)?;
                    cache.0.insert(path, (size, modified, h.clone()));
                    h
                }
            };
            out.push(Entry { path: rel, hash, size });
        }
    }
    Ok(())
}

/// What decides "did the book change": the (path, hash) set.
pub fn fingerprint(entries: &[Entry]) -> Vec<(String, String)> {
    entries.iter().map(|e| (e.path.clone(), e.hash.clone())).collect()
}

/// Confirms every file the snapshot manifest lists exists in `staging` with a matching SHA-256, right
/// before a swap. The download already hashed each file as it landed, but the staging folder is not
/// locked afterward (a crash recovery pass, a concurrent listing), so this re-check catches anything
/// that happened to it since. On any mismatch the caller should delete staging and stop.
pub fn verify_staged(staging: &Path, files: &[RemoteFile]) -> AppResult<()> {
    for file in files {
        let full = safe_join(staging, &file.path)?;
        if hash_file(&full)? != file.hash {
            return Err(AppError::msg(format!("Arquivo ausente ou alterado no backup: {}", file.path)));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn book() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(META_FILE), "{}").unwrap();
        fs::create_dir_all(dir.path().join("capitulos")).unwrap();
        fs::write(dir.path().join("capitulos").join("c1.md"), "abc").unwrap();
        dir
    }

    #[test]
    fn hashes_known_content() {
        let dir = book();
        let h = hash_file(&dir.path().join("capitulos").join("c1.md")).unwrap();
        assert_eq!(h, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn lists_relative_paths_with_slashes_sorted() {
        let dir = book();
        let entries = build(dir.path(), &mut HashCache::default()).unwrap();
        let paths: Vec<&str> = entries.iter().map(|e| e.path.as_str()).collect();
        assert_eq!(paths, vec!["capitulos/c1.md", "metadata.json"]);
        assert_eq!(entries[0].size, 3);
    }

    #[test]
    fn skips_dot_names_and_tmp_files() {
        let dir = book();
        fs::write(dir.path().join(".DS_Store"), "x").unwrap();
        fs::write(dir.path().join("metadata.json.tmp"), "x").unwrap();
        fs::create_dir_all(dir.path().join(".git")).unwrap();
        fs::write(dir.path().join(".git").join("HEAD"), "x").unwrap();
        let entries = build(dir.path(), &mut HashCache::default()).unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn needs_metadata() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        assert!(build(dir.path(), &mut HashCache::default()).is_err());
    }

    #[test]
    fn verify_staged_accepts_matching_files() {
        let dir = book();
        let files = build(dir.path(), &mut HashCache::default())
            .unwrap()
            .into_iter()
            .map(|e| RemoteFile { path: e.path, hash: e.hash, size: e.size })
            .collect::<Vec<_>>();
        assert!(verify_staged(dir.path(), &files).is_ok());
    }

    #[test]
    fn verify_staged_rejects_a_changed_file() {
        let dir = book();
        let files = build(dir.path(), &mut HashCache::default())
            .unwrap()
            .into_iter()
            .map(|e| RemoteFile { path: e.path, hash: e.hash, size: e.size })
            .collect::<Vec<_>>();
        fs::write(dir.path().join("capitulos").join("c1.md"), "changed after download").unwrap();
        assert!(verify_staged(dir.path(), &files).is_err());
    }

    #[test]
    fn verify_staged_rejects_a_missing_file() {
        let dir = book();
        let files = build(dir.path(), &mut HashCache::default())
            .unwrap()
            .into_iter()
            .map(|e| RemoteFile { path: e.path, hash: e.hash, size: e.size })
            .collect::<Vec<_>>();
        fs::remove_file(dir.path().join("capitulos").join("c1.md")).unwrap();
        assert!(verify_staged(dir.path(), &files).is_err());
    }

    #[test]
    fn changed_file_gets_a_new_hash_through_the_cache() {
        let dir = book();
        let mut cache = HashCache::default();
        let before = build(dir.path(), &mut cache).unwrap();
        fs::write(dir.path().join("capitulos").join("c1.md"), "abcd").unwrap();
        let after = build(dir.path(), &mut cache).unwrap();
        assert_ne!(before[0].hash, after[0].hash);
        assert_eq!(fingerprint(&after)[1], ("metadata.json".to_string(), before[1].hash.clone()));
    }
}
