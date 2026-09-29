//! Local cloud state (`cloud.json` in the app data folder): per server, the vault and each book's backup.
use std::{collections::BTreeMap, fs, path::Path};

use serde::{Deserialize, Serialize};

use super::config::DEFAULT_API_URL;
use crate::error::AppResult;
use crate::storage::atomic::write_atomic;

pub const CLOUD_FILE: &str = "cloud.json";

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CloudFile {
    /// None means the default server.
    #[serde(default)]
    pub api_url: Option<String>,
    #[serde(default)]
    pub servers: BTreeMap<String, ServerState>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerState {
    #[serde(default)]
    pub vault_id: Option<String>,
    #[serde(default)]
    pub key_id: Option<String>,
    #[serde(default)]
    pub books: BTreeMap<String, BookCloud>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookCloud {
    #[serde(default)]
    pub enabled: bool,
    /// Set once a backup exists on the server: this is what lights the cover badge.
    #[serde(default)]
    pub last_backup_at: Option<u64>,
    #[serde(default)]
    pub last_snapshot_id: Option<String>,
    /// Comment threads already copied into the notes whose resolution the server has not confirmed.
    #[serde(default)]
    pub pending_resolve: Vec<String>,
    /// When "Buscar comentários" last ran for this book (ms), shown next to the button.
    #[serde(default)]
    pub last_comments_at: Option<u64>,
}

impl CloudFile {
    /// A missing or broken file starts empty: the server still holds the backups.
    pub fn load(path: &Path) -> CloudFile {
        match fs::read(path) {
            Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|e| {
                eprintln!("ignoring invalid {}: {e}", path.display());
                CloudFile::default()
            }),
            Err(_) => CloudFile::default(),
        }
    }

    pub fn save(&self, path: &Path) -> AppResult<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        write_atomic(path, &serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }

    pub fn api_url(&self) -> &str {
        self.api_url.as_deref().unwrap_or(DEFAULT_API_URL)
    }

    pub fn server(&self) -> Option<&ServerState> {
        self.servers.get(self.api_url())
    }

    pub fn server_mut(&mut self) -> &mut ServerState {
        let url = self.api_url().to_string();
        self.servers.entry(url).or_default()
    }

    pub fn book(&self, id: &str) -> Option<&BookCloud> {
        self.server()?.books.get(id)
    }

    pub fn book_mut(&mut self, id: &str) -> &mut BookCloud {
        self.server_mut().books.entry(id.to_string()).or_default()
    }

    pub fn in_vault(&self, id: &str) -> bool {
        self.book(id).is_some_and(|b| b.last_backup_at.is_some())
    }

    pub fn enabled_books(&self) -> Vec<String> {
        self.server()
            .map(|s| s.books.iter().filter(|(_, b)| b.enabled).map(|(id, _)| id.clone()).collect())
            .unwrap_or_default()
    }

    pub fn has_vault(&self) -> bool {
        self.server().is_some_and(|s| s.vault_id.is_some())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_or_invalid_file_is_empty_state() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(CloudFile::load(&dir.path().join(CLOUD_FILE)), CloudFile::default());
        fs::write(dir.path().join(CLOUD_FILE), "{nope").unwrap();
        assert_eq!(CloudFile::load(&dir.path().join(CLOUD_FILE)), CloudFile::default());
    }

    #[test]
    fn saves_and_loads_back() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sub").join(CLOUD_FILE);
        let mut f = CloudFile::default();
        f.server_mut().vault_id = Some("vlt_1".into());
        f.book_mut("b1").last_backup_at = Some(5);
        f.save(&path).unwrap();
        assert_eq!(CloudFile::load(&path), f);
    }

    #[test]
    fn each_server_keeps_its_own_vault_and_books() {
        let mut f = CloudFile::default();
        f.server_mut().vault_id = Some("vlt_default".into());
        f.book_mut("b1").last_backup_at = Some(1);
        f.api_url = Some("https://outro.dev/api".into());
        assert!(!f.has_vault());
        assert!(!f.in_vault("b1"));
        f.book_mut("b1").enabled = true;
        f.api_url = None;
        assert!(f.has_vault());
        assert!(f.in_vault("b1"));
        assert!(!f.book("b1").unwrap().enabled);
    }

    #[test]
    fn in_vault_needs_a_backup_and_enabled_lists_only_enabled() {
        let mut f = CloudFile::default();
        f.book_mut("a").enabled = true;
        f.book_mut("b").last_backup_at = Some(3);
        assert!(!f.in_vault("a"));
        assert!(f.in_vault("b"));
        assert_eq!(f.enabled_books(), vec!["a".to_string()]);
    }

    #[test]
    fn pending_resolve_is_per_book() {
        let mut f = CloudFile::default();
        f.book_mut("a").pending_resolve.push("cmt_1".into());
        assert!(f.book("b").is_none());
        assert_eq!(f.book("a").unwrap().pending_resolve, vec!["cmt_1"]);
    }
}
