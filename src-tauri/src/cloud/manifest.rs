//! Lists a book folder with the SHA-256 of each file, as the backup sends it. For an encrypted book the
//! hash is the one of the sealed blob (see `crypto`), which is what the server stores and checks.
use std::{collections::HashMap, fs, io::{self, Read}, path::{Path, PathBuf}, time::SystemTime};

use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::storage::paths::{safe_join, META_FILE};

use super::{api::RemoteFile, crypto::{self, VaultKey}};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    /// Relative to the book folder, with `/`.
    pub path: String,
    pub hash: String,
    pub size: u64,
}

/// Hashes by (path, size, modified time, key): unchanged files are not read again. The key fingerprint
/// (zeros for an open book) keeps a plain hash from standing in for a sealed one.
#[derive(Default)]
pub struct HashCache(HashMap<PathBuf, (u64, SystemTime, [u8; 8], String)>);

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

/// `metadata.json` always goes as is: the server reads the book id and title from it.
pub fn sealable<'k>(path: &str, key: Option<&'k VaultKey>) -> Option<&'k VaultKey> {
    key.filter(|_| path != META_FILE)
}

/// The bytes the server stores for a file: sealed for an encrypted book, the file itself otherwise.
pub fn blob_bytes(full: &Path, path: &str, key: Option<&VaultKey>) -> io::Result<Vec<u8>> {
    let plain = fs::read(full)?;
    Ok(match sealable(path, key) {
        Some(k) => crypto::seal(k, path, &plain),
        None => plain,
    })
}

fn blob_hash(full: &Path, path: &str, key: Option<&VaultKey>) -> io::Result<String> {
    match sealable(path, key) {
        Some(_) => Ok(format!("{:x}", Sha256::digest(blob_bytes(full, path, key)?))),
        None => hash_file(full),
    }
}

pub fn build(dir: &Path, cache: &mut HashCache, key: Option<&VaultKey>) -> AppResult<Vec<Entry>> {
    let mut out = Vec::new();
    walk(dir, "", cache, key, &mut out)?;
    if !out.iter().any(|e| e.path == META_FILE) {
        return Err(AppError::msg("A obra não tem metadata.json"));
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn walk(dir: &Path, prefix: &str, cache: &mut HashCache, key: Option<&VaultKey>, out: &mut Vec<Entry>) -> AppResult<()> {
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
            walk(&entry.path(), &rel, cache, key, out)?;
        } else if meta.is_file() {
            let path = entry.path();
            let (size, modified) = (meta.len(), meta.modified()?);
            let tag = sealable(&rel, key).map(|k| k.fingerprint()).unwrap_or_default();
            let hash = match cache.0.get(&path) {
                Some((s, m, t, h)) if *s == size && *m == modified && *t == tag => h.clone(),
                _ => {
                    let h = blob_hash(&path, &rel, key)?;
                    cache.0.insert(path, (size, modified, tag, h.clone()));
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
        let entries = build(dir.path(), &mut HashCache::default(), None).unwrap();
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
        let entries = build(dir.path(), &mut HashCache::default(), None).unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn needs_metadata() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a.md"), "x").unwrap();
        assert!(build(dir.path(), &mut HashCache::default(), None).is_err());
    }

    #[test]
    fn verify_staged_accepts_matching_files() {
        let dir = book();
        let files = build(dir.path(), &mut HashCache::default(), None)
            .unwrap()
            .into_iter()
            .map(|e| RemoteFile { path: e.path, hash: e.hash, size: e.size })
            .collect::<Vec<_>>();
        assert!(verify_staged(dir.path(), &files).is_ok());
    }

    #[test]
    fn verify_staged_rejects_a_changed_file() {
        let dir = book();
        let files = build(dir.path(), &mut HashCache::default(), None)
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
        let files = build(dir.path(), &mut HashCache::default(), None)
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
        let before = build(dir.path(), &mut cache, None).unwrap();
        fs::write(dir.path().join("capitulos").join("c1.md"), "abcd").unwrap();
        let after = build(dir.path(), &mut cache, None).unwrap();
        assert_ne!(before[0].hash, after[0].hash);
        assert_eq!(fingerprint(&after)[1], ("metadata.json".to_string(), before[1].hash.clone()));
    }

    #[test]
    fn an_encrypted_book_hashes_sealed_blobs_but_keeps_metadata_plain() {
        let dir = book();
        let key = VaultKey::from_hex(&"ab".repeat(32)).unwrap();
        let mut cache = HashCache::default();
        let plain = build(dir.path(), &mut cache, None).unwrap();
        let sealed = build(dir.path(), &mut cache, Some(&key)).unwrap();
        assert_ne!(plain[0].hash, sealed[0].hash, "chapter must be sealed");
        assert_eq!(plain[1].hash, sealed[1].hash, "metadata.json stays plain");
        let blob = blob_bytes(&dir.path().join("capitulos").join("c1.md"), "capitulos/c1.md", Some(&key)).unwrap();
        assert_eq!(format!("{:x}", Sha256::digest(&blob)), sealed[0].hash);
        assert_eq!(crypto::open(Some(&key), &blob).unwrap(), b"abc");
    }
}
