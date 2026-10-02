//! Scribalis Cloud: vault key, backups, restore, public links and comments.
pub mod api;
pub mod backup;
pub mod client;
pub mod comments;
pub mod config;
pub mod error;
pub mod inbox;
pub mod keychain;
pub mod manifest;
pub mod on_close;
pub mod progress;
pub mod restore;
pub mod scheduler;
pub mod shares;
pub mod status;
pub mod swap;

use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use client::Client;
use error::{CloudError, CloudResult, LOCAL};
use status::CloudFile;

pub struct CloudInner {
    pub file: CloudFile,
    /// Keychain cache for the current server: None = not read yet, Some(None) = no key.
    key: Option<Option<String>>,
    pub hashes: manifest::HashCache,
    /// Fingerprint of the last manifest sent per book, this session.
    pub sent: HashMap<String, Vec<(String, String)>>,
    /// Why automatic backups stopped for this session (key refused, no space).
    pub paused: Option<String>,
    /// No automatic backup before this time (ms), after `rate_limited`.
    pub retry_at: u64,
    pub running: HashSet<String>,
    pub rerun: HashSet<String>,
    /// Books with a comment fetch in flight, so two clicks do not import the same comments twice.
    pub fetching: HashSet<String>,
}

/// Cloud state managed by Tauri. Never hold the lock across an `.await`.
pub struct CloudState {
    path: PathBuf,
    inner: Mutex<CloudInner>,
}

impl CloudState {
    pub fn load(path: PathBuf) -> Self {
        let inner = CloudInner {
            file: CloudFile::load(&path),
            key: None,
            hashes: Default::default(),
            sent: HashMap::new(),
            paused: None,
            retry_at: 0,
            running: HashSet::new(),
            rerun: HashSet::new(),
            fetching: HashSet::new(),
        };
        Self { path, inner: Mutex::new(inner) }
    }

    pub fn lock(&self) -> CloudResult<MutexGuard<'_, CloudInner>> {
        self.inner.lock().map_err(|_| CloudError::new(LOCAL, "Estado interno indisponível"))
    }

    /// Changes `cloud.json` and saves it.
    pub fn edit<T>(&self, f: impl FnOnce(&mut CloudFile) -> T) -> CloudResult<T> {
        let mut g = self.lock()?;
        let out = f(&mut g.file);
        g.file.save(&self.path)?;
        Ok(out)
    }

    /// Replaces the cached key (after activating, connecting, deleting or switching servers).
    pub fn set_key(&self, key: Option<String>) -> CloudResult<()> {
        self.lock()?.key = Some(key);
        Ok(())
    }

    /// Forgets the cached key, so the next client reads the keychain of the current server.
    pub fn reset_key(&self) -> CloudResult<()> {
        self.lock()?.key = None;
        Ok(())
    }

    /// Client for the current server, with its key when there is one.
    pub fn client(&self) -> CloudResult<Client> {
        let mut g = self.lock()?;
        let url = g.file.api_url().to_string();
        if g.key.is_none() {
            g.key = Some(keychain::read(&url)?);
        }
        Client::new(&url, g.key.clone().flatten())
    }

    pub fn vault_client(&self) -> CloudResult<Client> {
        let client = self.client()?;
        if client.has_key() { Ok(client) } else { Err(CloudError::no_vault()) }
    }
}
