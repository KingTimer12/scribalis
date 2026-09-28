# Nuvem (cofre, backup, links, comentários nas notas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Back up books to a Scribalis Cloud server, restore them, share a chapter or the workspace by public link, and copy visitors' comments into the notes.

**Architecture:** A new Rust module `src-tauri/src/cloud/` owns every network call, the vault key (system keychain), hashing and the folder swap on restore. Tauri commands in three files (`cloud_vault.rs`, `cloud_backup.rs`, `cloud_share.rs`) expose it. The webview only shows a right-side Cloud drawer, a "Nuvem" badge on covers, a status in the bottom bar, and the notes drawer (moved to the right).

**Tech Stack:** Rust (Tauri 2, reqwest 0.13 with rustls, keyring 3, sha2, tokio), SolidJS, Tailwind v4 + `global.css`, vitest, bun.

**Spec:** `docs/superpowers/specs/2026-09-28-nuvem-backup-links-design.md`

## Global Constraints

- Comments in English in every language; UI text in Portuguese (`CLAUDE.md`).
- One responsibility per file; no god files. A new Rust `mod` per subject (`CLAUDE.md`).
- Data and data processing stay in Rust; the webview holds only screen state and the open chapter (`CLAUDE.md`).
- Every change request ends with a commit; commit messages have **no** `Co-Authored-By` or any attribution line.
- Default API URL: `https://kingtimer12.dev/api/scribalis/v1`. Accept only `https://`, plus `http://localhost` and `http://127.0.0.1`.
- The key lives only in the system keychain (service `Scribalis`, account = normalized API URL). No file fallback.
- `cloud.json` lives in `app_data_dir`, never inside `Documentos/Scribalis`.
- The backup skips names starting with `.` and names ending in `.tmp`.
- Auto backup runs when leaving a book, every 10 minutes, and on window close (10 s limit).
- Restore replaces the book: download and verify into `.restaurando-<id>`, then back up the current state, then swap folders.
- Comments: write the notes first, then `PATCH resolved: true`; ids waiting for resolution are kept per book.
- No fake server: the HTTP layer is tested manually; `cargo test` covers pure logic only.
- Typecheck: `./node_modules/.bin/tsc --noEmit -p .` (on Windows the binary is `tsc.exe`). Front tests: `bun run test`. Rust tests: `cargo test --manifest-path src-tauri/Cargo.toml`.

## Review Focus

1. **A file over the server limit (for example a 60 MB image in `imagens/`):** the automatic backup must pause for the session with "sem espaço" instead of retrying every 10 minutes. This is covered by `policy_for` tests in Task 10.
2. **The app dies mid-restore:** the next start must leave exactly one intact book folder, with no hidden leftovers and no duplicate book in the library. This is covered by `recover` tests in Task 6.
3. **A comment on a chapter that was deleted afterwards:** it must land in "Comentários recebidos", and a second fetch must reuse that item. This is covered in Task 7.
4. **The resolve call fails after the notes were written:** the next fetch must not copy the thread again, and it must retry resolving. This is covered by the `threads` skip test (Task 7) and the per-book `pending_resolve` test (Task 3).
5. **Switching the API URL and back:** the old server's vault, books and badge state come back untouched. This is covered by the per-server test in Task 3.

---

## File Structure

**Rust — new**

| File | Responsibility |
|---|---|
| `src-tauri/src/cloud/mod.rs` | Module list; `CloudState` (lock, save, client) |
| `src-tauri/src/cloud/error.rs` | `CloudError`, server error JSON parsing |
| `src-tauri/src/cloud/config.rs` | API URL default and validation |
| `src-tauri/src/cloud/status.rs` | `cloud.json` model, load/save |
| `src-tauri/src/cloud/manifest.rs` | Folder walk + SHA-256 with a hash cache |
| `src-tauri/src/cloud/api.rs` | Serde types of requests and responses |
| `src-tauri/src/cloud/swap.rs` | Staging folders, swap in, crash recovery |
| `src-tauri/src/cloud/comments.rs` | Threads, note formatting, writing notes to disk |
| `src-tauri/src/cloud/keychain.rs` | Key in the system keychain |
| `src-tauri/src/cloud/client.rs` | reqwest wrapper: auth, timeouts, JSON, file up/download |
| `src-tauri/src/cloud/backup.rs` | Backup flow, status events, pause policy |
| `src-tauri/src/cloud/scheduler.rs` | 10-minute background loop |
| `src-tauri/src/cloud/restore.rs` | Download a snapshot, restore in place, download a new book |
| `src-tauri/src/cloud/shares.rs` | Create, list, change, revoke links |
| `src-tauri/src/cloud/inbox.rs` | Fetch comments, write them to notes, resolve |
| `src-tauri/src/commands/cloud_vault.rs` | Vault, keys, API URL, remote books |
| `src-tauri/src/commands/cloud_backup.rs` | Book backup state, backup, snapshots, restore, download |
| `src-tauri/src/commands/cloud_share.rs` | Links and comments |

**Rust — modified:**
- `Cargo.toml`
- `lib.rs`: setup and handlers.
- `commands/mod.rs`
- `commands/library.rs`: the `cloud` flag.
- `model/views.rs`: `BookSummary.cloud`.
- `ops/library.rs`: skip dot folders.
- `state.rs`: `Library::replace`.

**Front — new**

| File | Responsibility |
|---|---|
| `src/api/cloud.ts` | Command wrappers |
| `src/api/mock/cloud.ts` | In-memory stand-in of the cloud commands |
| `src/store/actions/cloud.ts` | Cloud actions (backup, restore, links, comments, vault) |
| `src/store/actions/cloud.test.ts` | Action tests over the mock |
| `src/components/cloud/CloudPanel.tsx` | Right drawer shell |
| `src/components/cloud/BookCloudSection.tsx` | "Esta obra": toggle, backup now, comments, delete |
| `src/components/cloud/SnapshotList.tsx` | Backups with two-step restore |
| `src/components/cloud/ShareList.tsx` | Links: copy, change, revoke |
| `src/components/cloud/ShareForm.tsx` | New link options |
| `src/components/cloud/VaultSection.tsx` | API URL, activate/connect, usage, remote books, delete vault |
| `src/components/cloud/KeyList.tsx` | Device keys |
| `src/components/chrome/CloudIndicator.tsx` | Bottom bar status |

**Front — modified:**
- API and state: `src/api/types.ts`, `src/api/mock/db.ts`, `src/api/mock/index.ts`, `src/lib/types.ts`, `src/store/state.ts`, `src/store/focus.ts`.
- Actions and commands: `src/store/actions/library.ts`, `src/store/keys/global.ts`, `src/store/commands/palette.ts`, `src/data/shortcuts.ts`.
- Components: `src/components/panels/NotesPanel.tsx`, `src/components/library/BookTile.tsx`, `src/components/chrome/BottomBar.tsx`, `src/components/workspace/treeMenu.ts`.
- App shell and styles: `src/App.tsx`, `src/styles/global.css`.

**Other:** `.github/workflows/ci.yml` and `release.yml` (libdbus), `README.md`, and the spec (per-book `pendingResolve`).

---

### Task 1: Dependencies, rustls provider, `CloudError`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/cloud/mod.rs`
- Create: `src-tauri/src/cloud/error.rs`

**Interfaces:**
- Produces:
  - `cloud::error::{CloudError, CloudResult}`. `CloudError` has the fields `status: u16`, `code: String`, `message: String`, `retry_after: Option<u64>` and `missing: Vec<String>`.
  - Methods: `CloudError::new(code: &str, message) -> CloudError`, `::network()`, `::no_vault()`, `::from_response(status: u16, body: &[u8])` and `.is(code) -> bool`.
  - Codes as constants: `NETWORK`, `UNEXPECTED`, `LOCAL`, `KEYCHAIN`, `NO_VAULT`.
  - Conversions: `From<CloudError> for AppError`, `From<AppError> for CloudError`, `From<std::io::Error> for CloudError`.

- [ ] **Step 1: Add dependencies**

In `src-tauri/Cargo.toml`, under `[dependencies]`, after `quick-xml = "0.37"`:

```toml
reqwest = { version = "0.13", default-features = false, features = ["json", "stream", "rustls-no-provider"] }
rustls = { version = "0.23", default-features = false, features = ["ring"] }
keyring = { version = "3", features = ["apple-native", "windows-native", "sync-secret-service", "crypto-rust"] }
sha2 = "0.10"
tokio = { version = "1", features = ["fs", "io-util", "time", "sync", "rt"] }
tokio-util = { version = "0.7", features = ["io"] }
futures-util = "0.3"
```

`reqwest` with `rustls-no-provider` and `rustls` with `ring` match what `tauri-plugin-updater` already compiles. The app does not gain a second TLS stack.

- [ ] **Step 2: Write the failing tests**

Create `src-tauri/src/cloud/error.rs`:

```rust
//! Errors from the cloud server, kept with their stable code so callers can react to them.
use serde::Deserialize;

use crate::error::AppError;

pub const NETWORK: &str = "network";
pub const UNEXPECTED: &str = "unexpected";
pub const LOCAL: &str = "local";
pub const KEYCHAIN: &str = "keychain";
pub const NO_VAULT: &str = "no_vault";

#[derive(Debug, Clone, PartialEq)]
pub struct CloudError {
    /// HTTP status, or 0 when the error did not come from a response.
    pub status: u16,
    pub code: String,
    /// Portuguese, ready for a toast.
    pub message: String,
    /// Seconds to wait, from `rate_limited`.
    pub retry_after: Option<u64>,
    /// Hashes the server still needs, from `missing_blobs`.
    pub missing: Vec<String>,
}

pub type CloudResult<T> = Result<T, CloudError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_code_message_and_extras_inside_error() {
        let body = br#"{"error":{"code":"missing_blobs","message":"Envie estes arquivos antes de fechar o backup","missing":["ab","cd"]}}"#;
        let e = CloudError::from_response(409, body);
        assert_eq!((e.status, e.code.as_str()), (409, "missing_blobs"));
        assert_eq!(e.message, "Envie estes arquivos antes de fechar o backup");
        assert_eq!(e.missing, vec!["ab", "cd"]);
    }

    #[test]
    fn reads_retry_after_from_rate_limited() {
        let body = br#"{"error":{"code":"rate_limited","message":"Muitas requisições","retryAfter":42}}"#;
        assert_eq!(CloudError::from_response(429, body).retry_after, Some(42));
    }

    #[test]
    fn non_json_body_becomes_generic_message_with_status() {
        let e = CloudError::from_response(502, b"<html>Bad Gateway</html>");
        assert_eq!(e.code, UNEXPECTED);
        assert_eq!(e.message, "O servidor da nuvem respondeu algo inesperado (HTTP 502).");
    }

    #[test]
    fn converts_to_app_error_as_its_message() {
        let e: AppError = CloudError::network().into();
        assert_eq!(e.0, "Sem conexão com o servidor da nuvem.");
    }
}
```

Create `src-tauri/src/cloud/mod.rs`:

```rust
//! Scribalis Cloud: vault key, backups, restore, public links and comments.
pub mod error;
```

In `src-tauri/src/lib.rs`, add `mod cloud;` right after `mod commands;`.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::error`
Expected: compile error, `no function or associated item named 'from_response'`.

- [ ] **Step 4: Implement**

Add to `src-tauri/src/cloud/error.rs`, above `#[cfg(test)]`:

```rust
#[derive(Deserialize)]
struct Envelope {
    error: Body,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Body {
    code: String,
    message: String,
    #[serde(default)]
    retry_after: Option<u64>,
    #[serde(default)]
    missing: Vec<String>,
}

impl CloudError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { status: 0, code: code.to_string(), message: message.into(), retry_after: None, missing: Vec::new() }
    }

    pub fn network() -> Self {
        Self::new(NETWORK, "Sem conexão com o servidor da nuvem.")
    }

    pub fn no_vault() -> Self {
        Self::new(NO_VAULT, "A nuvem ainda não foi ativada neste computador.")
    }

    /// Error from a non-success response: the server's `{ error: { code, message, … } }`, or a generic one.
    pub fn from_response(status: u16, body: &[u8]) -> Self {
        match serde_json::from_slice::<Envelope>(body) {
            Ok(Envelope { error: b }) => {
                Self { status, code: b.code, message: b.message, retry_after: b.retry_after, missing: b.missing }
            }
            Err(_) => Self {
                status,
                ..Self::new(UNEXPECTED, format!("O servidor da nuvem respondeu algo inesperado (HTTP {status})."))
            },
        }
    }

    pub fn is(&self, code: &str) -> bool {
        self.code == code
    }
}

impl From<CloudError> for AppError {
    fn from(e: CloudError) -> Self {
        AppError::msg(e.message)
    }
}

impl From<AppError> for CloudError {
    fn from(e: AppError) -> Self {
        CloudError::new(LOCAL, e.0)
    }
}

impl From<std::io::Error> for CloudError {
    fn from(e: std::io::Error) -> Self {
        AppError::from(e).into()
    }
}
```

In `src-tauri/src/lib.rs`, first line inside `.setup(|app| {`:

```rust
            // reqwest is built without a crypto provider (same as the updater): install ring once.
            let _ = rustls::crypto::ring::default_provider().install_default();
```

- [ ] **Step 5: Run tests and build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::error`
Expected: 4 passed.
Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: builds. Warnings about the unused `cloud` module are fine for now.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/src/cloud
git commit -m "feat(cloud): dependencies and server error parsing"
```

---

### Task 2: API URL validation

**Files:**
- Create: `src-tauri/src/cloud/config.rs`
- Modify: `src-tauri/src/cloud/mod.rs`

**Interfaces:**
- Produces: `cloud::config::DEFAULT_API_URL: &str`; `cloud::config::normalize_api_url(raw: &str) -> AppResult<String>` (trimmed, no trailing `/`).

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/cloud/config.rs`:

```rust
//! Where the cloud API lives. A custom server can replace the default.
use reqwest::Url;

use crate::error::{AppError, AppResult};

pub const DEFAULT_API_URL: &str = "https://kingtimer12.dev/api/scribalis/v1";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_https_and_drops_trailing_slash() {
        assert_eq!(normalize_api_url(" https://meu.servidor/api/scribalis/v1/ ").unwrap(), "https://meu.servidor/api/scribalis/v1");
    }

    #[test]
    fn accepts_plain_http_only_on_this_machine() {
        assert_eq!(normalize_api_url("http://localhost:3000/api/scribalis/v1").unwrap(), "http://localhost:3000/api/scribalis/v1");
        assert!(normalize_api_url("http://127.0.0.1:3000/api").is_ok());
        assert!(normalize_api_url("http://meu.servidor/api").is_err());
    }

    #[test]
    fn rejects_garbage_query_and_credentials() {
        assert!(normalize_api_url("servidor").is_err());
        assert!(normalize_api_url("ftp://x.dev").is_err());
        assert!(normalize_api_url("https://x.dev/api?a=1").is_err());
        assert!(normalize_api_url("https://eu:senha@x.dev/api").is_err());
    }
}
```

In `cloud/mod.rs` add `pub mod config;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::config`
Expected: compile error, `cannot find function 'normalize_api_url'`.

- [ ] **Step 3: Implement**

Add above the tests:

```rust
/// Trims, drops the trailing `/` and checks the URL. The key travels in every request, so plain
/// `http://` is allowed only for a server on this machine.
pub fn normalize_api_url(raw: &str) -> AppResult<String> {
    let invalid = || AppError::msg("Endereço inválido. Use https://…");
    let trimmed = raw.trim().trim_end_matches('/');
    let url = Url::parse(trimmed).map_err(|_| invalid())?;
    let host = url.host_str().unwrap_or("");
    let secure = match url.scheme() {
        "https" => !host.is_empty(),
        "http" => host == "localhost" || host == "127.0.0.1",
        _ => false,
    };
    if !secure || url.query().is_some() || url.fragment().is_some() || !url.username().is_empty() {
        return Err(invalid());
    }
    Ok(trimmed.to_string())
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::config`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud
git commit -m "feat(cloud): API URL validation"
```

---

### Task 3: `cloud.json` state

**Files:**
- Create: `src-tauri/src/cloud/status.rs`
- Modify: `src-tauri/src/cloud/mod.rs`
- Modify: `docs/superpowers/specs/2026-09-28-nuvem-backup-links-design.md` (the `pendingResolve` example)

**Interfaces:**
- Consumes: `config::DEFAULT_API_URL`, `storage::atomic::write_atomic`.
- Produces:
  - `status::CLOUD_FILE = "cloud.json"`.
  - `CloudFile { api_url: Option<String>, servers: BTreeMap<String, ServerState> }`.
  - `ServerState { vault_id: Option<String>, key_id: Option<String>, books: BTreeMap<String, BookCloud> }`.
  - `BookCloud { enabled: bool, last_backup_at: Option<u64>, last_snapshot_id: Option<String>, pending_resolve: Vec<String> }`.
  - `CloudFile` methods: `load(&Path) -> CloudFile`, `save(&self, &Path) -> AppResult<()>`, `api_url(&self) -> &str`, `server(&self) -> Option<&ServerState>`, `server_mut(&mut self) -> &mut ServerState`, `book(&self, id) -> Option<&BookCloud>`, `book_mut(&mut self, id) -> &mut BookCloud`, `in_vault(&self, id) -> bool`, `enabled_books(&self) -> Vec<String>`, `has_vault(&self) -> bool`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/cloud/status.rs`:

```rust
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
```

In `cloud/mod.rs` add `pub mod status;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::status`
Expected: compile error, `no function or associated item named 'load'`.

- [ ] **Step 3: Implement**

Add above the tests:

```rust
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
```

In the spec, "Estado local" section, replace the JSON example so that `pendingResolve` sits inside each book, and change the bullet about it:

```json
      "books": {
        "x1k2…": { "enabled": true, "lastBackupAt": 1790000000000, "lastSnapshotId": "snp_…", "pendingResolve": ["cmt_…"] }
      }
```

The bullet becomes: "`books[id].pendingResolve`: conversas dessa obra já copiadas para as notas cuja resolução no servidor ainda não foi confirmada. É por obra porque a rota de resolver leva o `bookId`."

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::status`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud docs/superpowers/specs/2026-09-28-nuvem-backup-links-design.md
git commit -m "feat(cloud): local cloud state per server and per book"
```

---

### Task 4: Book manifest with SHA-256

**Files:**
- Create: `src-tauri/src/cloud/manifest.rs`
- Modify: `src-tauri/src/cloud/mod.rs`

**Interfaces:**
- Produces:
  - `manifest::Entry { path: String, hash: String, size: u64 }` (derives `Clone, PartialEq, Eq, Debug`).
  - `manifest::HashCache` (`Default`).
  - `manifest::build(dir: &Path, cache: &mut HashCache) -> AppResult<Vec<Entry>>`, sorted by path.
  - `manifest::hash_file(path: &Path) -> std::io::Result<String>`, lowercase hex.
  - `manifest::fingerprint(entries: &[Entry]) -> Vec<(String, String)>`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/cloud/manifest.rs`:

```rust
//! Lists a book folder with the SHA-256 of each file, as the backup sends it.
use std::{collections::HashMap, fs, io::{self, Read}, path::{Path, PathBuf}, time::SystemTime};

use sha2::{Digest, Sha256};

use crate::error::{AppError, AppResult};
use crate::storage::paths::META_FILE;

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
```

In `cloud/mod.rs` add `pub mod manifest;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::manifest`
Expected: compile error, `cannot find function 'hash_file'`.

- [ ] **Step 3: Implement**

Add above the tests:

```rust
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
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::manifest`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud
git commit -m "feat(cloud): book manifest with cached SHA-256"
```

---

### Task 5: API types

**Files:**
- Create: `src-tauri/src/cloud/api.rs`
- Modify: `src-tauri/src/cloud/mod.rs`

**Interfaces:**
- Produces: the serde types below. All of them are `rename_all = "camelCase"`. Response types derive `Deserialize, Serialize, Debug, Clone, PartialEq`; `Serialize` is there because commands return them to the webview.
  - **Vault and keys:** `IdOnly`, `NewKey { id, label, secret }`, `VaultCreated { vault, key }`, `NewKeyResponse { key }`, `Usage { bytes, quota }`, `VaultInfo { id, key_id, created_at, books, usage }`, `KeyInfo { id, label, created_at, last_used_at: Option<u64>, current }`, `KeyList { keys }`.
  - **Blobs:** `Missing { missing }`.
  - **Books and snapshots:** `Snapshot { id, created_at, note: Option<String>, file_count, total_size }`, `RemoteBook { id, title, author, updated_at, snapshots: u64, open_comments: u64, latest: Option<Snapshot> }`, `BookList { books }`, `BookDetail { id, title, snapshots: Vec<Snapshot> }`, `SnapshotCreated { snapshot, unchanged }`, `RemoteFile { path, hash, size }`, `SnapshotFiles { snapshot, files }`.
  - **Links:** `Share { id, url, book_id, kind, target: Option<String>, snapshot_id: Option<String>, follow, include_notes, allow_comments, created_at, expires_at: Option<u64>, views }`, `ShareResponse { share }`, `ShareList { shares }`.
  - **Comments:** `Anchor { exact }`, `Author { name, kind }`, `Comment { id, parent_id: Option<String>, node_id, anchor: Option<Anchor>, body, author, created_at }`, `CommentList { comments }`.
  - **Request bodies (Serialize only):** `LabelBody<'a> { label }`, `HashesBody<'a> { hashes }`, `FileRef<'a> { path, hash }`, `SnapshotBody<'a> { files }`, `ShareBody { book_id, kind, target, snapshot_id, include_notes, allow_comments, expires_in_days: Option<u32> }`, `SharePatch { snapshot_id: Option<String>, include_notes: Option<bool>, allow_comments: Option<bool>, expires_in_days: Option<Option<u32>> }` (the `None` fields are skipped), `ResolveBody { resolved: bool }`.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/cloud/api.rs` with only the tests (so it fails):

```rust
//! Request and response bodies of the Scribalis Cloud API (formats in the spec, "Rotas que o servidor precisa ter").
use serde::{Deserialize, Serialize};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_vault_created() {
        let v: VaultCreated = serde_json::from_str(
            r#"{"vault":{"id":"vlt_1"},"key":{"id":"key_1","label":"Casa","secret":"scb_x"}}"#,
        ).unwrap();
        assert_eq!((v.vault.id.as_str(), v.key.secret.as_str()), ("vlt_1", "scb_x"));
    }

    #[test]
    fn reads_book_list_with_and_without_latest() {
        let l: BookList = serde_json::from_str(r#"{"books":[
            {"id":"b1","title":"A","author":"","updatedAt":1,"snapshots":1,"openComments":2,
             "latest":{"id":"snp_1","createdAt":10,"note":null,"fileCount":3,"totalSize":99}},
            {"id":"b2","title":"B","author":"","updatedAt":1,"snapshots":0,"openComments":0,"latest":null}]}"#).unwrap();
        assert_eq!(l.books[0].latest.as_ref().unwrap().created_at, 10);
        assert!(l.books[1].latest.is_none());
    }

    #[test]
    fn reads_share_and_comment() {
        let s: ShareResponse = serde_json::from_str(r#"{"share":{"id":"shr_1","url":"https://h/scribalis/s/t","bookId":"b1",
            "kind":"chapter","target":"c1","snapshotId":null,"follow":true,"includeNotes":false,"allowComments":true,
            "createdAt":1,"expiresAt":null,"views":0}}"#).unwrap();
        assert!(s.share.follow && s.share.snapshot_id.is_none());
        let c: CommentList = serde_json::from_str(r#"{"comments":[{"id":"cmt_1","parentId":null,"nodeId":"c1",
            "anchor":{"exact":"cheiro","prefix":"O ","suffix":" de","start":2,"end":8},"body":"Oi",
            "author":{"name":"Mira","kind":"guest"},"createdAt":5,"updatedAt":5,"resolved":false,"shareId":"shr_1"}]}"#).unwrap();
        assert_eq!(c.comments[0].anchor.as_ref().unwrap().exact, "cheiro");
        assert_eq!(c.comments[0].author.name, "Mira");
    }

    #[test]
    fn share_patch_sends_null_to_clear_expiry_and_skips_unset_fields() {
        let p = SharePatch { expires_in_days: Some(None), ..Default::default() };
        assert_eq!(serde_json::to_string(&p).unwrap(), r#"{"expiresInDays":null}"#);
    }
}
```

In `cloud/mod.rs` add `pub mod api;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::api`
Expected: compile error, `cannot find type 'VaultCreated'`.

- [ ] **Step 3: Implement**

Add above the tests:

```rust
#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IdOnly {
    pub id: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKey {
    pub id: String,
    pub label: String,
    pub secret: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultCreated {
    pub vault: IdOnly,
    pub key: NewKey,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewKeyResponse {
    pub key: NewKey,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub bytes: u64,
    pub quota: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub id: String,
    pub key_id: String,
    pub created_at: u64,
    pub books: u64,
    pub usage: Usage,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyInfo {
    pub id: String,
    pub label: String,
    pub created_at: u64,
    #[serde(default)]
    pub last_used_at: Option<u64>,
    pub current: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct KeyList {
    pub keys: Vec<KeyInfo>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Missing {
    pub missing: Vec<String>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub created_at: u64,
    #[serde(default)]
    pub note: Option<String>,
    pub file_count: u64,
    pub total_size: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBook {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub updated_at: u64,
    pub snapshots: u64,
    #[serde(default)]
    pub open_comments: u64,
    pub latest: Option<Snapshot>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookList {
    pub books: Vec<RemoteBook>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookDetail {
    pub id: String,
    pub title: String,
    /// Newest first.
    pub snapshots: Vec<Snapshot>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotCreated {
    pub snapshot: Snapshot,
    pub unchanged: bool,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFile {
    pub path: String,
    pub hash: String,
    pub size: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotFiles {
    pub snapshot: Snapshot,
    pub files: Vec<RemoteFile>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Share {
    pub id: String,
    pub url: String,
    pub book_id: String,
    pub kind: String,
    pub target: Option<String>,
    pub snapshot_id: Option<String>,
    pub follow: bool,
    pub include_notes: bool,
    pub allow_comments: bool,
    pub created_at: u64,
    pub expires_at: Option<u64>,
    pub views: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShareResponse {
    pub share: Share,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShareList {
    pub shares: Vec<Share>,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Anchor {
    pub exact: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Author {
    pub name: String,
    pub kind: String,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub parent_id: Option<String>,
    /// Chapter id or workspace node id.
    pub node_id: String,
    pub anchor: Option<Anchor>,
    pub body: String,
    pub author: Author,
    pub created_at: u64,
}

#[derive(Deserialize, Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommentList {
    pub comments: Vec<Comment>,
}

#[derive(Serialize)]
pub struct LabelBody<'a> {
    pub label: &'a str,
}

#[derive(Serialize)]
pub struct HashesBody<'a> {
    pub hashes: &'a [String],
}

#[derive(Serialize)]
pub struct FileRef<'a> {
    pub path: &'a str,
    pub hash: &'a str,
}

#[derive(Serialize)]
pub struct SnapshotBody<'a> {
    pub files: Vec<FileRef<'a>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareBody {
    pub book_id: String,
    pub kind: String,
    pub target: Option<String>,
    /// "latest" follows new backups; a snapshot id freezes the version.
    pub snapshot_id: String,
    pub include_notes: bool,
    pub allow_comments: bool,
    pub expires_in_days: Option<u32>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SharePatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snapshot_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub include_notes: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_comments: Option<bool>,
    /// Some(None) sends null, which removes the expiry.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in_days: Option<Option<u32>>,
}

#[derive(Serialize)]
pub struct ResolveBody {
    pub resolved: bool,
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::api`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud
git commit -m "feat(cloud): API request and response types"
```

---

### Task 6: Library ignores dot folders; restore folder swap and recovery

**Files:**
- Modify: `src-tauri/src/ops/library.rs` (`scan`, around line 32)
- Modify: `src-tauri/src/state.rs` (new `Library::replace` plus test)
- Create: `src-tauri/src/cloud/swap.rs`
- Modify: `src-tauri/src/cloud/mod.rs`

**Interfaces:**
- Produces:
  - `swap::staging_dir(root: &Path, id: &str) -> PathBuf` (`root/.restaurando-<id>`).
  - `swap::fresh_staging(root, id) -> AppResult<PathBuf>`.
  - `swap::mark_destination(root, id, target: &Path) -> AppResult<()>`.
  - `swap::swap_in(root, id, target: &Path) -> AppResult<()>`.
  - `swap::place_new(root, id, target: &Path) -> AppResult<()>`.
  - `swap::abort(root, id)`.
  - `swap::recover(root: &Path)`.
  - `Library::replace(&mut self, dir: &Path, meta: &Metadata)`.

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/ops/library.rs`, inside its `#[cfg(test)] mod tests`, add:

```rust
    #[test]
    fn scan_ignores_hidden_folders() {
        let root = tempfile::tempdir().unwrap();
        let (_dir, meta) = create_book(root.path(), "A").unwrap();
        let hidden = root.path().join(format!(".restaurando-{}", meta.id));
        std::fs::create_dir_all(&hidden).unwrap();
        crate::storage::metadata_io::write_metadata(&hidden, &meta).unwrap();
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 1);
        assert!(scan.warnings.is_empty());
    }
```

In `src-tauri/src/state.rs` tests add:

```rust
    #[test]
    fn replacing_a_book_does_not_move_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta);
        lib.start_session_if_needed();
        let mut restored = meta.clone();
        restored.chapters[0].words = 500;
        lib.replace(&dir, &restored);
        assert_eq!(lib.today(), 0);
        assert_eq!(lib.total_of(&meta.id), 500);
    }
```

Create `src-tauri/src/cloud/swap.rs`:

```rust
//! Restore swaps whole book folders. Staging folders start with `.`, so the library scan skips them,
//! and `recover` cleans up after a crash in the middle of a swap.
use std::{fs, path::{Path, PathBuf}};

use crate::error::{AppError, AppResult};

const STAGING_PREFIX: &str = ".restaurando-";
const OLD_PREFIX: &str = ".antigo-";
/// Inside the staging folder: name of the book folder it replaces.
const DEST_FILE: &str = ".destino";

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
```

In `cloud/mod.rs` add `pub mod swap;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml swap scan_ignores replacing_a_book`
Expected: compile errors, `cannot find function 'fresh_staging'` and `no method named 'replace'`.

- [ ] **Step 3: Implement**

In `ops/library.rs` `scan`, replace the loop body:

```rust
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        // Hidden folders are restore staging (or the OS's own): never books.
        let hidden = path.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.'));
        if path.is_dir() && !hidden {
            dirs.push(path);
        }
    }
```

In `state.rs`, inside `impl Library`, after `forget`:

```rust
    /// The book's folder was replaced by a restored copy. The word difference joins the baseline,
    /// so the restore does not count as words written today.
    pub fn replace(&mut self, dir: &Path, meta: &Metadata) {
        let old = self.totals.get(&meta.id).copied().unwrap_or(0);
        let new = meta.total_words();
        if let Some(base) = self.session_base.as_mut() {
            *base = (*base + new).saturating_sub(old);
        }
        if self.open.as_ref().is_some_and(|(_, m)| m.id == meta.id) {
            self.open = None;
        }
        self.dirs.insert(meta.id.clone(), dir.to_path_buf());
        self.totals.insert(meta.id.clone(), new);
    }
```

In `swap.rs`, above the tests:

```rust
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
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all pass, including 6 new `cloud::swap` tests, `scan_ignores_hidden_folders` and `replacing_a_book_does_not_move_today`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src
git commit -m "feat(cloud): folder swap for restore, crash recovery, hidden folders out of the library"
```

---

### Task 7: Comments into notes (pure part and disk)

**Files:**
- Create: `src-tauri/src/cloud/comments.rs`
- Modify: `src-tauri/src/cloud/mod.rs`

**Interfaces:**
- Consumes: `api::{Comment, Anchor, Author}`, `model::workspace::{find, find_mut, Node, NodeKind, Workspace}`, `storage::workspace_io::{read_workspace, write_workspace, write_node_doc}`, `storage::metadata_io::write_metadata`, `ids::{new_id, now_ms}`.
- Produces:
  - `comments::Thread<'a> { root: &'a Comment, replies: Vec<&'a Comment> }`.
  - `comments::threads(comments: &[Comment], skip: &[String]) -> Vec<Thread>`.
  - `comments::short_datetime(ms: u64, utc_offset_min: i32) -> String` (`"21/09 14:13"`).
  - `comments::format_thread(t: &Thread, orphan: bool, utc_offset_min: i32) -> String`.
  - `comments::append_note(existing: &str, block: &str) -> String`.
  - `comments::INBOX_TITLE = "Comentários recebidos"`.
  - `comments::apply(dir: &Path, meta: &mut Metadata, threads: &[Thread], utc_offset_min: i32) -> AppResult<Vec<String>>`: the root ids that were written.

- [ ] **Step 1: Write the failing tests**

Create `src-tauri/src/cloud/comments.rs`:

```rust
//! Visitors' comments become plain notes: each thread is appended to the notes of its chapter or
//! workspace item (or of an inbox text when the item was deleted).
use std::path::Path;

use super::api::Comment;
use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::Doc,
    metadata::Metadata,
    workspace::{find, find_mut, Node, NodeKind, Workspace},
};
use crate::storage::{
    metadata_io::write_metadata,
    workspace_io::{read_workspace, write_node_doc, write_workspace},
};

pub const INBOX_TITLE: &str = "Comentários recebidos";
const QUOTE_MAX: usize = 80;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud::api::{Anchor, Author};
    use crate::ops::{library::create_book, workspace};

    fn comment(id: &str, parent: Option<&str>, node: &str, body: &str, at: u64) -> Comment {
        Comment {
            id: id.into(),
            parent_id: parent.map(Into::into),
            node_id: node.into(),
            anchor: None,
            body: body.into(),
            author: Author { name: "Mira".into(), kind: "guest".into() },
            created_at: at,
        }
    }

    #[test]
    fn formats_utc_date_with_offset() {
        assert_eq!(short_datetime(1_790_000_000_000, 0), "21/09 14:13");
        assert_eq!(short_datetime(1_790_000_000_000, -180), "21/09 11:13");
    }

    #[test]
    fn groups_replies_under_roots_and_skips_pending() {
        let list = vec![
            comment("r1", None, "c1", "a", 1),
            comment("x", Some("r1"), "c1", "b", 3),
            comment("r2", None, "c1", "c", 2),
            comment("y", Some("r1"), "c1", "d", 2),
        ];
        let t = threads(&list, &[]);
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].replies.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), vec!["y", "x"]);
        assert_eq!(threads(&list, &["r1".into()]).len(), 1);
    }

    #[test]
    fn formats_a_thread_with_quote_and_indented_multiline_reply() {
        let mut root = comment("r1", None, "c1", "Achei confuso aqui.", 1_790_000_000_000);
        root.anchor = Some(Anchor { exact: "cheiro de\nferrugem".into() });
        let reply = comment("x", Some("r1"), "c1", "Linha um\nLinha dois", 1_790_000_060_000);
        let t = Thread { root: &root, replies: vec![&reply] };
        assert_eq!(
            format_thread(&t, false, 0),
            "— Mira · 21/09 14:13 · sobre “cheiro de ferrugem”\nAchei confuso aqui.\n  ↳ Mira · 21/09 14:14: Linha um\n    Linha dois"
        );
    }

    #[test]
    fn long_quotes_are_cut_and_orphans_marked() {
        let mut root = comment("r1", None, "c1", "x", 0);
        root.anchor = Some(Anchor { exact: "a".repeat(100) });
        let text = format_thread(&Thread { root: &root, replies: vec![] }, true, 0);
        assert!(text.contains(&format!("“{}…”", "a".repeat(80))));
        assert!(text.lines().next().unwrap().ends_with("(item apagado)"));
    }

    #[test]
    fn appends_after_a_blank_line() {
        assert_eq!(append_note("", "novo"), "novo");
        assert_eq!(append_note("antigo\n\n", "novo"), "antigo\n\nnovo");
    }

    #[test]
    fn writes_to_chapter_node_and_inbox_and_reuses_the_inbox() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "A").unwrap();
        let chapter = meta.chapters[0].id.clone();
        let node = workspace::create(&dir, None, 0, NodeKind::Text, "Ficha").unwrap().id;
        let list = vec![
            comment("r1", None, &chapter, "no capítulo", 1),
            comment("r2", None, &node, "na ficha", 2),
            comment("r3", None, "apagado", "sem destino", 3),
        ];
        let done = apply(&dir, &mut meta, &threads(&list, &[]), 0).unwrap();
        assert_eq!(done, vec!["r1", "r2", "r3"]);
        assert!(meta.chapters[0].notes.contains("no capítulo"));
        let saved = crate::storage::metadata_io::read_metadata(&dir).unwrap();
        assert!(saved.chapters[0].notes.contains("no capítulo"));
        let ws = read_workspace(&dir).unwrap();
        assert!(find(&ws.items, &node).unwrap().notes.contains("na ficha"));
        let inbox: Vec<&Node> = ws.items.iter().filter(|n| n.title == INBOX_TITLE).collect();
        assert_eq!(inbox.len(), 1);
        assert!(inbox[0].notes.contains("sem destino"));

        let more = vec![comment("r4", None, "sumiu", "outro", 4)];
        apply(&dir, &mut meta, &threads(&more, &[]), 0).unwrap();
        let ws = read_workspace(&dir).unwrap();
        let inbox: Vec<&Node> = ws.items.iter().filter(|n| n.title == INBOX_TITLE).collect();
        assert_eq!(inbox.len(), 1);
        assert!(inbox[0].notes.contains("sem destino") && inbox[0].notes.contains("outro"));
    }
}
```

In `cloud/mod.rs` add `pub mod comments;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::comments`
Expected: compile error, `cannot find function 'short_datetime'`.

- [ ] **Step 3: Implement**

Add above the tests:

```rust
pub struct Thread<'a> {
    pub root: &'a Comment,
    pub replies: Vec<&'a Comment>,
}

/// Roots (minus `skip`) with their replies, oldest first.
pub fn threads<'a>(comments: &'a [Comment], skip: &[String]) -> Vec<Thread<'a>> {
    let mut out: Vec<Thread> = comments
        .iter()
        .filter(|c| c.parent_id.is_none() && !skip.contains(&c.id))
        .map(|root| Thread { root, replies: Vec::new() })
        .collect();
    for c in comments.iter().filter(|c| c.parent_id.is_some()) {
        if let Some(t) = out.iter_mut().find(|t| c.parent_id.as_deref() == Some(t.root.id.as_str())) {
            t.replies.push(c);
        }
    }
    for t in &mut out {
        t.replies.sort_by_key(|c| c.created_at);
    }
    out.sort_by_key(|t| t.root.created_at);
    out
}

/// Days since 1970-01-01 → (year, month, day), proleptic Gregorian (Howard Hinnant's algorithm).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// "dd/mm hh:mm" in local time; `utc_offset_min` is local minus UTC (Brasília: -180).
pub fn short_datetime(ms: u64, utc_offset_min: i32) -> String {
    let secs = (ms / 1000) as i64 + i64::from(utc_offset_min) * 60;
    let (_, month, day) = civil_from_days(secs.div_euclid(86_400));
    let rem = secs.rem_euclid(86_400);
    format!("{day:02}/{month:02} {:02}:{:02}", rem / 3600, rem % 3600 / 60)
}

fn quote(exact: &str) -> String {
    let one_line = exact.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() <= QUOTE_MAX {
        return one_line;
    }
    let cut: String = one_line.chars().take(QUOTE_MAX).collect();
    format!("{}…", cut.trim_end())
}

pub fn format_thread(t: &Thread, orphan: bool, utc_offset_min: i32) -> String {
    let root = t.root;
    let mut head = format!("— {} · {}", root.author.name, short_datetime(root.created_at, utc_offset_min));
    if let Some(anchor) = &root.anchor {
        head.push_str(&format!(" · sobre “{}”", quote(&anchor.exact)));
    }
    if orphan {
        head.push_str(" (item apagado)");
    }
    let mut lines = vec![head, root.body.trim_end().to_string()];
    for reply in &t.replies {
        let mut body = reply.body.trim_end().lines();
        let first = body.next().unwrap_or("");
        let when = short_datetime(reply.created_at, utc_offset_min);
        lines.push(format!("  ↳ {} · {when}: {first}", reply.author.name));
        lines.extend(body.map(|l| format!("    {l}")));
    }
    lines.join("\n")
}

pub fn append_note(existing: &str, block: &str) -> String {
    let base = existing.trim_end();
    if base.is_empty() { block.to_string() } else { format!("{base}\n\n{block}") }
}

enum Target {
    Chapter(usize),
    Node,
    Inbox,
}

/// Root-level text that collects threads whose item no longer exists; created on first use.
fn inbox<'a>(dir: &Path, ws: &'a mut Workspace) -> AppResult<&'a mut Node> {
    let found = ws.items.iter().position(|n| n.kind == NodeKind::Text && n.title == INBOX_TITLE);
    let i = match found {
        Some(i) => i,
        None => {
            let id = new_id();
            let file = format!("{id}.md");
            write_node_doc(dir, &file, &Doc::default())?;
            ws.items.push(Node::leaf(id, NodeKind::Text, INBOX_TITLE, &file));
            ws.items.len() - 1
        }
    };
    Ok(&mut ws.items[i])
}

/// Appends each thread to its item's notes and saves; returns the root ids written.
pub fn apply(dir: &Path, meta: &mut Metadata, threads: &[Thread], utc_offset_min: i32) -> AppResult<Vec<String>> {
    if threads.is_empty() {
        return Ok(Vec::new());
    }
    let mut ws = read_workspace(dir)?;
    let (mut meta_changed, mut ws_changed) = (false, false);
    let mut done = Vec::new();
    for t in threads {
        let node_id = t.root.node_id.as_str();
        let target = if let Some(i) = meta.chapters.iter().position(|c| c.id == node_id) {
            Target::Chapter(i)
        } else if find(&ws.items, node_id).is_some() {
            Target::Node
        } else {
            Target::Inbox
        };
        match target {
            Target::Chapter(i) => {
                let c = &mut meta.chapters[i];
                c.notes = append_note(&c.notes, &format_thread(t, false, utc_offset_min));
                meta_changed = true;
            }
            Target::Node => {
                if let Some(n) = find_mut(&mut ws.items, node_id) {
                    n.notes = append_note(&n.notes, &format_thread(t, false, utc_offset_min));
                    ws_changed = true;
                }
            }
            Target::Inbox => {
                let n = inbox(dir, &mut ws)?;
                n.notes = append_note(&n.notes, &format_thread(t, true, utc_offset_min));
                ws_changed = true;
            }
        }
        done.push(t.root.id.clone());
    }
    if ws_changed {
        write_workspace(dir, &ws)?;
    }
    if meta_changed {
        meta.updated_at = now_ms();
        write_metadata(dir, meta)?;
    }
    Ok(done)
}
```

If `model::workspace::Workspace` is not `pub`-reachable from `crate::model::workspace`, export it the same way `Node` is.

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::comments`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud
git commit -m "feat(cloud): comment threads formatted into notes"
```

---

### Task 8: Keychain, HTTP client, `CloudState`

No automated tests: this is the thin I/O layer, checked manually in Task 17. The deliverable is a clean build.

**Files:**
- Create: `src-tauri/src/cloud/keychain.rs`
- Create: `src-tauri/src/cloud/client.rs`
- Modify: `src-tauri/src/cloud/mod.rs`

**Interfaces:**
- Consumes: `error::*`, `status::CloudFile`, `manifest::HashCache`.
- Produces:
  - **Keychain:** `keychain::{read(api_url) -> CloudResult<Option<String>>, write(api_url, secret) -> CloudResult<()>, delete(api_url) -> CloudResult<()>}`.
  - **Client construction:** `client::Client::new(base: &str, key: Option<String>) -> CloudResult<Client>` and `.has_key() -> bool`.
  - **Client JSON calls:** `.get<T>(path)`, `.post<B, T>(path, &B)`, `.patch<B, T>(path, &B)`. Each returns `CloudResult<T>`.
  - **Client other calls:** `.delete(path) -> CloudResult<()>`, `.put_file(path, &Path) -> CloudResult<()>`, `.download(path, &Path) -> CloudResult<()>`.
  - **`CloudState` construction and locking:** `CloudState::load(path: PathBuf) -> CloudState`, `.lock() -> CloudResult<MutexGuard<CloudInner>>`.
  - **`CloudState` helpers:** `.edit<T>(f: impl FnOnce(&mut CloudFile) -> T) -> CloudResult<T>` (saves the file), `.client() -> CloudResult<Client>`, `.vault_client() -> CloudResult<Client>`, `.set_key(Option<String>) -> CloudResult<()>`.
  - `CloudInner` fields:
    - `pub file: CloudFile`
    - `pub hashes: HashCache`
    - `pub sent: HashMap<String, Vec<(String, String)>>`
    - `pub paused: Option<String>`
    - `pub retry_at: u64`
    - `pub running: HashSet<String>`
    - `pub rerun: HashSet<String>`
    - `key: Option<Option<String>>` (private cache: outer `None` means the keychain was not read yet)

- [ ] **Step 1: Keychain**

Create `src-tauri/src/cloud/keychain.rs`:

```rust
//! The vault key lives in the system keychain, one entry per server. Never in a file.
use keyring::Entry;

use super::error::{CloudError, CloudResult, KEYCHAIN};

const SERVICE: &str = "Scribalis";

fn unavailable() -> CloudError {
    CloudError::new(KEYCHAIN, "O chaveiro do sistema não está disponível. Sem ele, o Scribalis não guarda a chave do cofre.")
}

fn entry(api_url: &str) -> CloudResult<Entry> {
    Entry::new(SERVICE, api_url).map_err(|_| unavailable())
}

pub fn read(api_url: &str) -> CloudResult<Option<String>> {
    match entry(api_url)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(unavailable()),
    }
}

pub fn write(api_url: &str, secret: &str) -> CloudResult<()> {
    entry(api_url)?.set_password(secret).map_err(|_| unavailable())
}

pub fn delete(api_url: &str) -> CloudResult<()> {
    match entry(api_url)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(unavailable()),
    }
}
```

- [ ] **Step 2: HTTP client**

Create `src-tauri/src/cloud/client.rs`:

```rust
//! Thin reqwest wrapper: base URL, Bearer key, timeouts, JSON and streamed files.
use std::{path::Path, time::Duration};

use futures_util::StreamExt;
use reqwest::{header, Method, RequestBuilder, Response};
use serde::{de::DeserializeOwned, Serialize};
use tokio::io::AsyncWriteExt;

use super::error::{CloudError, CloudResult};

const CONNECT: Duration = Duration::from_secs(10);
/// Files have no total limit, only this much silence.
const IDLE: Duration = Duration::from_secs(60);
const JSON_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone)]
pub struct Client {
    http: reqwest::Client,
    base: String,
    key: Option<String>,
}

impl Client {
    pub fn new(base: &str, key: Option<String>) -> CloudResult<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(CONNECT)
            .read_timeout(IDLE)
            .user_agent(concat!("Scribalis/", env!("CARGO_PKG_VERSION")))
            .build()
            .map_err(|_| CloudError::network())?;
        Ok(Self { http, base: base.to_string(), key })
    }

    pub fn has_key(&self) -> bool {
        self.key.is_some()
    }

    fn request(&self, method: Method, path: &str) -> RequestBuilder {
        let rb = self.http.request(method, format!("{}{}", self.base, path));
        match &self.key {
            Some(k) => rb.bearer_auth(k),
            None => rb,
        }
    }

    async fn send(rb: RequestBuilder) -> CloudResult<Response> {
        let res = rb.send().await.map_err(|_| CloudError::network())?;
        if res.status().is_success() {
            return Ok(res);
        }
        let status = res.status().as_u16();
        let body = res.bytes().await.unwrap_or_default();
        Err(CloudError::from_response(status, &body))
    }

    async fn json<T: DeserializeOwned>(rb: RequestBuilder) -> CloudResult<T> {
        let res = Self::send(rb.timeout(JSON_TIMEOUT)).await?;
        let status = res.status().as_u16();
        let body = res.bytes().await.map_err(|_| CloudError::network())?;
        serde_json::from_slice(&body).map_err(|_| CloudError::from_response(status, b""))
    }

    pub async fn get<T: DeserializeOwned>(&self, path: &str) -> CloudResult<T> {
        Self::json(self.request(Method::GET, path)).await
    }

    pub async fn post<B: Serialize + ?Sized, T: DeserializeOwned>(&self, path: &str, body: &B) -> CloudResult<T> {
        Self::json(self.request(Method::POST, path).json(body)).await
    }

    pub async fn patch<B: Serialize + ?Sized, T: DeserializeOwned>(&self, path: &str, body: &B) -> CloudResult<T> {
        Self::json(self.request(Method::PATCH, path).json(body)).await
    }

    pub async fn delete(&self, path: &str) -> CloudResult<()> {
        Self::send(self.request(Method::DELETE, path).timeout(JSON_TIMEOUT)).await.map(|_| ())
    }

    /// Streams a file as the raw request body.
    pub async fn put_file(&self, path: &str, file: &Path) -> CloudResult<()> {
        let f = tokio::fs::File::open(file).await?;
        let len = f.metadata().await?.len();
        let body = reqwest::Body::wrap_stream(tokio_util::io::ReaderStream::new(f));
        let rb = self
            .request(Method::PUT, path)
            .header(header::CONTENT_TYPE, "application/octet-stream")
            .header(header::CONTENT_LENGTH, len)
            .body(body);
        Self::send(rb).await.map(|_| ())
    }

    /// Streams a response body into `to`.
    pub async fn download(&self, path: &str, to: &Path) -> CloudResult<()> {
        let res = Self::send(self.request(Method::GET, path)).await?;
        let mut out = tokio::fs::File::create(to).await?;
        let mut stream = res.bytes_stream();
        while let Some(chunk) = stream.next().await {
            out.write_all(&chunk.map_err(|_| CloudError::network())?).await?;
        }
        out.flush().await?;
        Ok(())
    }
}
```

- [ ] **Step 3: `CloudState`**

Replace `src-tauri/src/cloud/mod.rs` with:

```rust
//! Scribalis Cloud: vault key, backups, restore, public links and comments.
pub mod api;
pub mod client;
pub mod comments;
pub mod config;
pub mod error;
pub mod keychain;
pub mod manifest;
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
```

`set_key` stores `Some(key)`, and `reset_key` stores `None` (not read yet). The interfaces list above includes both.

- [ ] **Step 4: Build**

Run: `cargo build --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: builds; all tests pass. Dead-code warnings for unused items are fine until Task 9.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud
git commit -m "feat(cloud): keychain, HTTP client and cloud state"
```

---

### Task 9: Vault commands, `cloud` flag in the library

**Files:**
- Create: `src-tauri/src/commands/cloud_vault.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/commands/library.rs`
- Modify: `src-tauri/src/model/views.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `CloudState`, `config::{normalize_api_url, DEFAULT_API_URL}`, `api::*`, `keychain`, `swap::recover`.
- Produces:
  - **Status and server:**
    - `cloud_overview() -> CloudOverview { apiUrl, defaultApiUrl, connected }`
    - `cloud_set_api_url(url: String) -> CloudOverview`
  - **Joining a vault:**
    - `cloud_activate(label: String) -> CloudOverview`
    - `cloud_connect(secret: String) -> CloudOverview`
  - **Vault and keys:**
    - `cloud_vault_info() -> VaultInfo`
    - `cloud_keys() -> Vec<KeyInfo>`
    - `cloud_add_key(label: String) -> NewKey`
    - `cloud_revoke_key(id: String) -> Vec<KeyInfo>`
    - `cloud_delete_vault() -> CloudOverview`
  - **Remote books:** `cloud_remote_books() -> Vec<RemoteBookView { id, title, snapshots, latestAt, openComments, local }>`.
  - **Library:** `BookSummary.cloud: bool`.

- [ ] **Step 1: `BookSummary.cloud` with a failing test**

In `src-tauri/src/model/views.rs`, add a field to `BookSummary`, after `updated_at`:

```rust
    /// Has a backup on the current cloud server (filled by the library command).
    pub cloud: bool,
```

In `BookSummary::from_meta` add `cloud: false,`. Add a test at the end of `views.rs` (create the `#[cfg(test)] mod tests` if missing):

```rust
#[cfg(test)]
mod cloud_flag_tests {
    use super::*;

    #[test]
    fn summary_starts_outside_the_cloud() {
        let meta = Metadata::new("id1".into(), "Obra", vec![]);
        let s = BookSummary::from_meta(std::path::Path::new("/x"), &meta);
        assert!(!s.cloud);
        assert!(serde_json::to_string(&s).unwrap().contains("\"cloud\":false"));
    }
}
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud_flag_tests`
Expected: PASS once the field exists. Before adding it, the build failed on the unknown field.

- [ ] **Step 2: Library listing fills the flag and recovers swaps**

In `src-tauri/src/commands/library.rs`:

```rust
use crate::cloud::{swap, CloudState};

fn listing(lib: &mut Library, cloud: &CloudState) -> AppResult<LibraryListing> {
    let first_run = !lib.root.exists();
    std::fs::create_dir_all(&lib.root)?;
    if first_run {
        ops::write_samples(&lib.root)?;
    }
    let root = lib.root.clone();
    swap::recover(&root);
    let scan = ops::scan(&root)?;
    let file = cloud.lock()?.file.clone();
    let books = scan
        .books
        .iter()
        .map(|(dir, meta)| {
            lib.register(dir, meta);
            BookSummary { cloud: file.in_vault(&meta.id), ..BookSummary::from_meta(dir, meta) }
        })
        .collect();
    lib.start_session_if_needed();
    Ok(LibraryListing { books, warnings: scan.warnings })
}

#[tauri::command]
pub async fn library_list(state: State<'_, SharedLibrary>, cloud: State<'_, CloudState>) -> AppResult<LibraryListing> {
    let mut lib = lock(&state)?;
    listing(&mut lib, &cloud)
}
```

Change `library_restore_samples` the same way: add a `cloud: State<'_, CloudState>` parameter and call `listing(&mut lib, &cloud)`.

- [ ] **Step 3: Vault commands**

Create `src-tauri/src/commands/cloud_vault.rs`:

```rust
//! Vault, device keys, API address and the list of books on the server.
use serde::Serialize;
use tauri::State;

use crate::cloud::{
    api::{BookList, KeyInfo, KeyList, LabelBody, NewKey, NewKeyResponse, VaultCreated, VaultInfo},
    client::Client,
    config::{normalize_api_url, DEFAULT_API_URL},
    keychain, CloudState,
};
use crate::error::{AppError, AppResult};
use crate::state::{lock, SharedLibrary};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudOverview {
    pub api_url: String,
    pub default_api_url: &'static str,
    pub connected: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBookView {
    pub id: String,
    pub title: String,
    pub snapshots: u64,
    pub latest_at: Option<u64>,
    pub open_comments: u64,
    /// Already on this computer.
    pub local: bool,
}

fn overview(cloud: &CloudState) -> AppResult<CloudOverview> {
    let g = cloud.lock()?;
    Ok(CloudOverview { api_url: g.file.api_url().to_string(), default_api_url: DEFAULT_API_URL, connected: g.file.has_vault() })
}

#[tauri::command]
pub async fn cloud_overview(cloud: State<'_, CloudState>) -> AppResult<CloudOverview> {
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_set_api_url(cloud: State<'_, CloudState>, url: String) -> AppResult<CloudOverview> {
    let url = normalize_api_url(&url)?;
    cloud.edit(|f| f.api_url = if url == DEFAULT_API_URL { None } else { Some(url) })?;
    cloud.reset_key()?;
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_activate(cloud: State<'_, CloudState>, label: String) -> AppResult<CloudOverview> {
    if cloud.lock()?.file.has_vault() {
        return Err(AppError::msg("Este computador já está conectado a um cofre."));
    }
    let url = cloud.lock()?.file.api_url().to_string();
    let created: VaultCreated = Client::new(&url, None)?.post("/vaults", &LabelBody { label: label.trim() }).await?;
    keychain::write(&url, &created.key.secret)?;
    cloud.set_key(Some(created.key.secret))?;
    cloud.edit(|f| {
        let s = f.server_mut();
        s.vault_id = Some(created.vault.id);
        s.key_id = Some(created.key.id);
    })?;
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_connect(cloud: State<'_, CloudState>, secret: String) -> AppResult<CloudOverview> {
    let secret = secret.trim().to_string();
    if !secret.starts_with("scb_") {
        return Err(AppError::msg("Código inválido. Ele começa com scb_."));
    }
    let url = cloud.lock()?.file.api_url().to_string();
    // Only a key the server accepts goes to the keychain.
    let info: VaultInfo = Client::new(&url, Some(secret.clone()))?.get("/vault").await?;
    keychain::write(&url, &secret)?;
    cloud.set_key(Some(secret))?;
    cloud.edit(|f| {
        let s = f.server_mut();
        s.vault_id = Some(info.id);
        s.key_id = Some(info.key_id);
    })?;
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_vault_info(cloud: State<'_, CloudState>) -> AppResult<VaultInfo> {
    Ok(cloud.vault_client()?.get("/vault").await?)
}

#[tauri::command]
pub async fn cloud_keys(cloud: State<'_, CloudState>) -> AppResult<Vec<KeyInfo>> {
    let list: KeyList = cloud.vault_client()?.get("/vault/keys").await?;
    Ok(list.keys)
}

/// New key for another computer. The only time a secret reaches the webview, to be copied.
#[tauri::command]
pub async fn cloud_add_key(cloud: State<'_, CloudState>, label: String) -> AppResult<NewKey> {
    let res: NewKeyResponse = cloud.vault_client()?.post("/vault/keys", &LabelBody { label: label.trim() }).await?;
    Ok(res.key)
}

#[tauri::command]
pub async fn cloud_revoke_key(cloud: State<'_, CloudState>, id: String) -> AppResult<Vec<KeyInfo>> {
    let client = cloud.vault_client()?;
    client.delete(&format!("/vault/keys/{id}")).await?;
    let list: KeyList = client.get("/vault/keys").await?;
    Ok(list.keys)
}

#[tauri::command]
pub async fn cloud_delete_vault(cloud: State<'_, CloudState>) -> AppResult<CloudOverview> {
    cloud.vault_client()?.delete("/vault").await?;
    let url = cloud.lock()?.file.api_url().to_string();
    keychain::delete(&url)?;
    cloud.set_key(None)?;
    cloud.edit(|f| {
        f.servers.remove(&url);
    })?;
    overview(&cloud)
}

/// Books on the server; also refreshes which local books carry the "Nuvem" badge.
#[tauri::command]
pub async fn cloud_remote_books(cloud: State<'_, CloudState>, state: State<'_, SharedLibrary>) -> AppResult<Vec<RemoteBookView>> {
    let list: BookList = cloud.vault_client()?.get("/books").await?;
    cloud.edit(|f| {
        let server = f.server_mut();
        for b in server.books.values_mut() {
            b.last_backup_at = None;
        }
        for remote in &list.books {
            if let Some(latest) = &remote.latest {
                let b = server.books.entry(remote.id.clone()).or_default();
                b.last_backup_at = Some(latest.created_at);
                b.last_snapshot_id = Some(latest.id.clone());
            }
        }
    })?;
    let lib = lock(&state)?;
    Ok(list
        .books
        .into_iter()
        .map(|b| RemoteBookView {
            local: lib.dir_of(&b.id).is_ok(),
            latest_at: b.latest.as_ref().map(|s| s.created_at),
            id: b.id,
            title: b.title,
            snapshots: b.snapshots,
            open_comments: b.open_comments,
        })
        .collect())
}

```

`?` converts `CloudError` into `AppError` through the `From` impl from Task 1.

- [ ] **Step 4: Register**

In `src-tauri/src/commands/mod.rs`, add `pub mod cloud_vault;`.

In `src-tauri/src/lib.rs`:
- Add `use cloud::{status::CLOUD_FILE, CloudState};`.
- In `setup`, after `app.manage(Mutex::new(Library::new(root)));`, add:

```rust
            let cloud_file = app.path().app_data_dir()?.join(CLOUD_FILE);
            app.manage(CloudState::load(cloud_file));
```

- Add `cloud_vault` to the `use commands::{…}` list.
- Add these to `generate_handler!`:

```rust
            cloud_vault::cloud_overview,
            cloud_vault::cloud_set_api_url,
            cloud_vault::cloud_activate,
            cloud_vault::cloud_connect,
            cloud_vault::cloud_vault_info,
            cloud_vault::cloud_keys,
            cloud_vault::cloud_add_key,
            cloud_vault::cloud_revoke_key,
            cloud_vault::cloud_delete_vault,
            cloud_vault::cloud_remote_books,
```

- [ ] **Step 5: Build and test**

Run: `cargo build --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: builds, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(cloud): vault, keys and API address commands; cloud flag on book summaries"
```

---

### Task 10: Backup, pause policy, scheduler, backup commands

**Files:**
- Create: `src-tauri/src/cloud/backup.rs`
- Create: `src-tauri/src/cloud/scheduler.rs`
- Create: `src-tauri/src/commands/cloud_backup.rs` (restore commands are added in Task 11)
- Modify: `src-tauri/src/cloud/mod.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `CloudState`, `manifest`, `api::{HashesBody, Missing, SnapshotBody, FileRef, SnapshotCreated, BookDetail, Snapshot}`, `storage::paths::safe_join`, `state::{lock, SharedLibrary}`.
- Produces:
  - **Types:** `backup::STATUS_EVENT = "cloud://status"`; `backup::CloudStatus { book_id, state: &'static str, last_backup_at: Option<u64>, message: Option<String> }`; `backup::Outcome { Sent(u64), Unchanged, Skipped }`; `backup::Policy { Offline, RetryAt(u64), Pause(&'static str) }`.
  - **Functions:**
    - `backup::policy_for(e: &CloudError, now: u64) -> Policy`
    - `backup::run(app: &AppHandle, book_id: &str, manual: bool) -> CloudResult<Outcome>`
    - `backup::run_all_changed(app: &AppHandle)`
    - `scheduler::start(app: AppHandle)`
  - **Commands:**
    - `cloud_book_state(bookId) -> BookCloudView { enabled, lastBackupAt, paused }`
    - `cloud_set_enabled(bookId, enabled) -> BookCloudView`
    - `cloud_backup(bookId, manual) -> BookCloudView`
    - `cloud_snapshots(bookId) -> Vec<Snapshot>`
    - `cloud_forget_book(bookId) -> BookCloudView`
    - `cloud_backup_on_close()`

- [ ] **Step 1: Write the failing tests (pause policy)**

Create `src-tauri/src/cloud/backup.rs`:

```rust
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
```

In `cloud/mod.rs` add `pub mod backup;`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::backup`
Expected: compile error, `cannot find function 'policy_for'`.

- [ ] **Step 3: Implement backup**

Add above the tests in `backup.rs`:

```rust
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
```

Create `src-tauri/src/cloud/scheduler.rs`:

```rust
//! Every 10 minutes, back up the enabled books that changed.
use std::time::Duration;

use tauri::AppHandle;

use super::backup;

const EVERY: Duration = Duration::from_secs(600);

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(EVERY).await;
            backup::run_all_changed(&app).await;
        }
    });
}
```

In `cloud/mod.rs` add `pub mod scheduler;`.

- [ ] **Step 4: Backup commands**

Create `src-tauri/src/commands/cloud_backup.rs`:

```rust
//! Per-book backup: state, toggle, manual run, the server's snapshot list and removal.
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::cloud::{
    api::{BookDetail, Snapshot},
    backup, CloudState,
};
use crate::error::{AppError, AppResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookCloudView {
    pub enabled: bool,
    pub last_backup_at: Option<u64>,
    /// Why automatic backups stopped this session, if they did.
    pub paused: Option<String>,
}

fn view(cloud: &CloudState, book_id: &str) -> AppResult<BookCloudView> {
    let g = cloud.lock()?;
    let b = g.file.book(book_id);
    Ok(BookCloudView {
        enabled: b.is_some_and(|b| b.enabled),
        last_backup_at: b.and_then(|b| b.last_backup_at),
        paused: g.paused.clone(),
    })
}

#[tauri::command]
pub async fn cloud_book_state(cloud: State<'_, CloudState>, book_id: String) -> AppResult<BookCloudView> {
    view(&cloud, &book_id)
}

/// Turning it on runs the first backup right away; turning it off keeps what is on the server.
#[tauri::command]
pub async fn cloud_set_enabled(app: AppHandle, book_id: String, enabled: bool) -> AppResult<BookCloudView> {
    let cloud = app.state::<CloudState>();
    if enabled && !cloud.lock()?.file.has_vault() {
        return Err(AppError::msg("Ative a nuvem primeiro."));
    }
    cloud.edit(|f| f.book_mut(&book_id).enabled = enabled)?;
    if enabled {
        backup::run(&app, &book_id, true).await?;
    }
    view(&cloud, &book_id)
}

/// `manual`: "Fazer backup agora". Otherwise an automatic run (leaving the book), silent when disabled.
#[tauri::command]
pub async fn cloud_backup(app: AppHandle, book_id: String, manual: bool) -> AppResult<BookCloudView> {
    let cloud = app.state::<CloudState>();
    let enabled = cloud.lock()?.file.book(&book_id).is_some_and(|b| b.enabled);
    if !enabled {
        if manual {
            return Err(AppError::msg("Ative o backup desta obra primeiro."));
        }
        return view(&cloud, &book_id);
    }
    backup::run(&app, &book_id, manual).await?;
    view(&cloud, &book_id)
}

#[tauri::command]
pub async fn cloud_snapshots(cloud: State<'_, CloudState>, book_id: String) -> AppResult<Vec<Snapshot>> {
    match cloud.vault_client()?.get::<BookDetail>(&format!("/books/{book_id}")).await {
        Ok(detail) => Ok(detail.snapshots),
        Err(e) if e.status == 404 => Ok(Vec::new()),
        Err(e) => Err(e.into()),
    }
}

/// "Apagar da nuvem": the book, its backups and its links leave the server.
#[tauri::command]
pub async fn cloud_forget_book(cloud: State<'_, CloudState>, book_id: String) -> AppResult<BookCloudView> {
    cloud.vault_client()?.delete(&format!("/books/{book_id}")).await?;
    cloud.edit(|f| {
        f.server_mut().books.remove(&book_id);
    })?;
    cloud.lock()?.sent.remove(&book_id);
    view(&cloud, &book_id)
}

/// Called by the webview while the window closes: at most 10 seconds of backup.
#[tauri::command]
pub async fn cloud_backup_on_close(app: AppHandle) -> AppResult<()> {
    let _ = tokio::time::timeout(Duration::from_secs(10), backup::run_all_changed(&app)).await;
    Ok(())
}
```

Register it:
- `commands/mod.rs`: add `pub mod cloud_backup;`.
- `lib.rs`: add `cloud_backup` to the `use commands::{…}` list.
- `lib.rs` handlers: add `cloud_backup::cloud_book_state`, `cloud_backup::cloud_set_enabled`, `cloud_backup::cloud_backup`, `cloud_backup::cloud_snapshots`, `cloud_backup::cloud_forget_book` and `cloud_backup::cloud_backup_on_close`.
- `lib.rs` `setup`: after managing `CloudState`, add `cloud::scheduler::start(app.handle().clone());`.

- [ ] **Step 5: Run tests and build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 2 new `cloud::backup` tests pass; build ok.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src
git commit -m "feat(cloud): incremental backup, pause policy, 10-minute scheduler and backup commands"
```

---

### Task 11: Restore and download

**Files:**
- Create: `src-tauri/src/cloud/restore.rs`
- Modify: `src-tauri/src/cloud/mod.rs`
- Modify: `src-tauri/src/commands/cloud_backup.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `swap::*`, `backup::run`, `manifest::hash_file`, `api::{SnapshotFiles, BookDetail}`, `Library::{replace, register, dir_of, root}`, `storage::{paths::{safe_join, slugify, unique_dir, META_FILE}, metadata_io::read_metadata}`, `model::views::{BookMeta, BookSummary}`.
- Produces:
  - `restore::restore(app, book_id, snapshot_id) -> CloudResult<(PathBuf, Metadata)>`
  - `restore::download_new(app, book_id) -> CloudResult<(PathBuf, Metadata)>`
  - commands `cloud_restore(bookId, snapshotId) -> BookMeta` and `cloud_download(bookId) -> BookSummary`

- [ ] **Step 1: Implement restore**

Create `src-tauri/src/cloud/restore.rs`:

```rust
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
```

Check that `storage::paths` exports `slugify` and `unique_dir` as `pub fn`. It does (see `paths.rs`). In `cloud/mod.rs` add `pub mod restore;`.

- [ ] **Step 2: Commands**

Append to `src-tauri/src/commands/cloud_backup.rs`:

```rust
use crate::cloud::restore;
use crate::model::views::{BookMeta, BookSummary};

#[tauri::command]
pub async fn cloud_restore(app: AppHandle, book_id: String, snapshot_id: String) -> AppResult<BookMeta> {
    let (dir, meta) = restore::restore(&app, &book_id, &snapshot_id).await?;
    Ok(BookMeta::from_meta(&dir, &meta))
}

#[tauri::command]
pub async fn cloud_download(app: AppHandle, book_id: String) -> AppResult<BookSummary> {
    let (dir, meta) = restore::download_new(&app, &book_id).await?;
    Ok(BookSummary { cloud: true, ..BookSummary::from_meta(&dir, &meta) })
}
```

Move these `use` lines to the top of the file with the others. Register `cloud_backup::cloud_restore` and `cloud_backup::cloud_download` in `lib.rs`.

- [ ] **Step 3: Build and test**

Run: `cargo build --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: builds; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src
git commit -m "feat(cloud): restore over a book and download a book from the vault"
```

---

### Task 12: Links and comments commands

**Files:**
- Create: `src-tauri/src/cloud/shares.rs`
- Create: `src-tauri/src/cloud/inbox.rs`
- Create: `src-tauri/src/commands/cloud_share.rs`
- Modify: `src-tauri/src/cloud/mod.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `api::{Share, ShareBody, SharePatch, ShareResponse, ShareList, CommentList, ResolveBody}`, `comments::{threads, apply}`, `backup::run`, `Library::with_book`.
- Produces:
  - **Types:**
    - `shares::ShareInput { book_id, kind, target: Option<String>, freeze, include_notes, allow_comments, expires_in_days: Option<u32> }` (Deserialize, camelCase)
    - `shares::ShareChange { freeze: Option<bool>, include_notes: Option<bool>, allow_comments: Option<bool>, expires_in_days: Option<u32>, clear_expiry: bool }`
  - **Functions:**
    - `shares::create(app, ShareInput) -> CloudResult<Share>`
    - `shares::list(cloud, book_id) -> CloudResult<Vec<Share>>`
    - `shares::change(cloud, book_id, id, ShareChange) -> CloudResult<Share>`
    - `shares::revoke(cloud, id) -> CloudResult<()>`
    - `inbox::fetch(app, book_id, utc_offset_min: i32) -> CloudResult<usize>`
  - **Commands:**
    - `cloud_shares(bookId) -> Share[]`
    - `cloud_share_create(input) -> Share`
    - `cloud_share_change(bookId, id, change) -> Share`
    - `cloud_share_revoke(id)`
    - `cloud_fetch_comments(bookId, utcOffsetMin) -> number`

- [ ] **Step 1: Write the failing test (patch building)**

Create `src-tauri/src/cloud/shares.rs`:

```rust
//! Public links to a chapter or to (part of) the workspace.
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use super::{
    api::{Share, ShareBody, ShareList, SharePatch, ShareResponse},
    backup,
    error::{CloudError, CloudResult},
    CloudState,
};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShareInput {
    pub book_id: String,
    /// "chapter" or "workspace".
    pub kind: String,
    pub target: Option<String>,
    /// Pin the current backup instead of following new ones.
    pub freeze: bool,
    pub include_notes: bool,
    pub allow_comments: bool,
    pub expires_in_days: Option<u32>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ShareChange {
    pub freeze: Option<bool>,
    pub include_notes: Option<bool>,
    pub allow_comments: Option<bool>,
    pub expires_in_days: Option<u32>,
    #[serde(default)]
    pub clear_expiry: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn change_becomes_a_patch() {
        let c = ShareChange { freeze: Some(false), clear_expiry: true, ..Default::default() };
        let p = patch_for(c, None).unwrap();
        assert_eq!(serde_json::to_string(&p).unwrap(), r#"{"snapshotId":"latest","expiresInDays":null}"#);
        let c = ShareChange { freeze: Some(true), expires_in_days: Some(7), ..Default::default() };
        let p = patch_for(c, Some("snp_1".into())).unwrap();
        assert_eq!(serde_json::to_string(&p).unwrap(), r#"{"snapshotId":"snp_1","expiresInDays":7}"#);
        assert!(patch_for(ShareChange { freeze: Some(true), ..Default::default() }, None).is_err());
    }
}
```

In `cloud/mod.rs` add `pub mod shares;` and `pub mod inbox;`.

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::shares`
Expected: compile error, `cannot find function 'patch_for'` (and `inbox.rs` missing; create it empty first with a `//!` line).

- [ ] **Step 3: Implement shares**

Add above the tests in `shares.rs`:

```rust
fn no_snapshot() -> CloudError {
    CloudError::new("no_snapshot", "Faça um backup antes de congelar a versão.")
}

fn patch_for(change: ShareChange, last_snapshot: Option<String>) -> CloudResult<SharePatch> {
    let snapshot_id = match change.freeze {
        Some(true) => Some(last_snapshot.ok_or_else(no_snapshot)?),
        Some(false) => Some("latest".to_string()),
        None => None,
    };
    let expires_in_days = if change.clear_expiry { Some(None) } else { change.expires_in_days.map(Some) };
    Ok(SharePatch { snapshot_id, include_notes: change.include_notes, allow_comments: change.allow_comments, expires_in_days })
}

fn last_snapshot(cloud: &CloudState, book_id: &str) -> CloudResult<Option<String>> {
    Ok(cloud.lock()?.file.book(book_id).and_then(|b| b.last_snapshot_id.clone()))
}

/// Links need a backup: the book is enabled and backed up first, so the link shows the current text.
pub async fn create(app: &AppHandle, input: ShareInput) -> CloudResult<Share> {
    let cloud = app.state::<CloudState>();
    cloud.edit(|f| f.book_mut(&input.book_id).enabled = true)?;
    backup::run(app, &input.book_id, false).await?;
    let snapshot_id = if input.freeze {
        last_snapshot(&cloud, &input.book_id)?.ok_or_else(no_snapshot)?
    } else {
        "latest".to_string()
    };
    let body = ShareBody {
        book_id: input.book_id,
        kind: input.kind,
        target: input.target,
        snapshot_id,
        include_notes: input.include_notes,
        allow_comments: input.allow_comments,
        expires_in_days: input.expires_in_days,
    };
    let res: ShareResponse = cloud.vault_client()?.post("/shares", &body).await?;
    Ok(res.share)
}

pub async fn list(cloud: &CloudState, book_id: &str) -> CloudResult<Vec<Share>> {
    let res: ShareList = cloud.vault_client()?.get("/shares").await?;
    Ok(res.shares.into_iter().filter(|s| s.book_id == book_id).collect())
}

pub async fn change(cloud: &CloudState, book_id: &str, id: &str, change: ShareChange) -> CloudResult<Share> {
    let patch = patch_for(change, last_snapshot(cloud, book_id)?)?;
    let res: ShareResponse = cloud.vault_client()?.patch(&format!("/shares/{id}"), &patch).await?;
    Ok(res.share)
}

pub async fn revoke(cloud: &CloudState, id: &str) -> CloudResult<()> {
    cloud.vault_client()?.delete(&format!("/shares/{id}")).await
}
```

- [ ] **Step 4: Implement inbox**

Write `src-tauri/src/cloud/inbox.rs`:

```rust
//! Fetches open comment threads, appends them to the notes and resolves them on the server.
use tauri::{AppHandle, Manager};

use super::{
    api::{CommentList, ResolveBody},
    comments,
    error::CloudResult,
    CloudState,
};
use crate::state::{lock, SharedLibrary};

fn pending(cloud: &CloudState, book_id: &str) -> CloudResult<Vec<String>> {
    Ok(cloud.lock()?.file.book(book_id).map(|b| b.pending_resolve.clone()).unwrap_or_default())
}

/// Returns how many threads were added to the notes. Notes are written before resolving;
/// a thread whose resolution fails stays in `pending_resolve` and is never copied twice.
pub async fn fetch(app: &AppHandle, book_id: &str, utc_offset_min: i32) -> CloudResult<usize> {
    let cloud = app.state::<CloudState>();
    let client = cloud.vault_client()?;
    let list: CommentList = client.get(&format!("/books/{book_id}/comments?status=open")).await?;
    let skip = pending(&cloud, book_id)?;
    let threads = comments::threads(&list.comments, &skip);
    let written = if threads.is_empty() {
        Vec::new()
    } else {
        lock(&app.state::<SharedLibrary>())?
            .with_book(book_id, |dir, meta| comments::apply(dir, meta, &threads, utc_offset_min))?
    };
    if !written.is_empty() {
        cloud.edit(|f| f.book_mut(book_id).pending_resolve.extend(written.iter().cloned()))?;
    }
    for id in pending(&cloud, book_id)? {
        let path = format!("/books/{book_id}/comments/{id}");
        let done = match client.patch::<_, serde_json::Value>(&path, &ResolveBody { resolved: true }).await {
            Ok(_) => true,
            Err(e) => e.status == 404,
        };
        if done {
            cloud.edit(|f| f.book_mut(book_id).pending_resolve.retain(|x| x != &id))?;
        }
    }
    Ok(written.len())
}
```

- [ ] **Step 5: Commands**

Create `src-tauri/src/commands/cloud_share.rs`:

```rust
//! Public links and the comments that arrive through them.
use tauri::{AppHandle, State};

use crate::cloud::{
    api::Share,
    inbox,
    shares::{self, ShareChange, ShareInput},
    CloudState,
};
use crate::error::AppResult;

#[tauri::command]
pub async fn cloud_shares(cloud: State<'_, CloudState>, book_id: String) -> AppResult<Vec<Share>> {
    Ok(shares::list(&cloud, &book_id).await?)
}

#[tauri::command]
pub async fn cloud_share_create(app: AppHandle, input: ShareInput) -> AppResult<Share> {
    Ok(shares::create(&app, input).await?)
}

#[tauri::command]
pub async fn cloud_share_change(cloud: State<'_, CloudState>, book_id: String, id: String, change: ShareChange) -> AppResult<Share> {
    Ok(shares::change(&cloud, &book_id, &id, change).await?)
}

#[tauri::command]
pub async fn cloud_share_revoke(cloud: State<'_, CloudState>, id: String) -> AppResult<()> {
    Ok(shares::revoke(&cloud, &id).await?)
}

/// `utc_offset_min`: local minus UTC in minutes (from the webview's clock), for the note dates.
#[tauri::command]
pub async fn cloud_fetch_comments(app: AppHandle, book_id: String, utc_offset_min: i32) -> AppResult<usize> {
    Ok(inbox::fetch(&app, &book_id, utc_offset_min).await?)
}
```

Register it:
- `commands/mod.rs`: add `pub mod cloud_share;`.
- `lib.rs`: add `cloud_share` to the `use commands::{…}` list.
- `lib.rs` handlers: add `cloud_share::cloud_shares`, `cloud_share::cloud_share_create`, `cloud_share::cloud_share_change`, `cloud_share::cloud_share_revoke` and `cloud_share::cloud_fetch_comments`.

- [ ] **Step 6: Test and build**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && cargo build --manifest-path src-tauri/Cargo.toml`
Expected: all pass (1 new in `cloud::shares`); build ok with no warnings from `cloud`.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src
git commit -m "feat(cloud): public links and comments copied into notes"
```

---

### Task 13: Front API, mock, state and actions

**Files:**
- Modify: `src/api/types.ts`
- Create: `src/api/cloud.ts`
- Create: `src/api/mock/cloud.ts`
- Modify: `src/api/mock/db.ts` (cloud mock state; `toSummary` fills `cloud`)
- Modify: `src/api/mock/index.ts`
- Modify: `src/lib/types.ts` (`Panel` adds `"cloud"`)
- Modify: `src/store/focus.ts` (`FocusTarget` adds `"cloud"`)
- Modify: `src/store/state.ts`
- Create: `src/store/actions/cloud.ts`
- Test: `src/store/actions/cloud.test.ts`

**Interfaces:**
- Consumes: the Rust commands from Tasks 9–12 (names and argument keys in camelCase).
- Produces:
  - **State (`src/store/state.ts`):**
    - `cloud: CloudOverview | null`
    - `cloudBook: BookCloudView | null` (the open book)
    - `cloudStatus: CloudStatus | null`
    - `shareDraft: ShareDraft | null`
  - **Actions for the vault:** `loadCloud()`, `setApiUrl(url)`, `activateCloud(label)`, `connectCloud(secret)`, `deleteVault()`, `syncCloudBadges()`.
  - **Actions for the open book:**
    - `loadBookCloud(bookId)`, `setBookBackup(enabled)`
    - `backupNow()`, `backupAuto(bookId)`, `backupOnClose()`
    - `restoreSnapshot(snapshotId)`, `downloadBook(bookId)`, `forgetBook()`
    - `createShare(input)`, `fetchComments(quiet)`, `applyCloudStatus(s)`

- [ ] **Step 1: Types**

Append to `src/api/types.ts`, and add `cloud: boolean;` to `BookSummary`:

```ts
export interface CloudOverview {
  apiUrl: string;
  defaultApiUrl: string;
  connected: boolean;
}

export interface VaultInfo {
  id: string;
  keyId: string;
  createdAt: number;
  books: number;
  usage: { bytes: number; quota: number };
}

export interface KeyInfo {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  current: boolean;
}

/** A new device key; `secret` is shown once to be copied to the other computer. */
export interface NewKey {
  id: string;
  label: string;
  secret: string;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  note: string | null;
  fileCount: number;
  totalSize: number;
}

export interface RemoteBookView {
  id: string;
  title: string;
  snapshots: number;
  latestAt: number | null;
  openComments: number;
  local: boolean;
}

export interface BookCloudView {
  enabled: boolean;
  lastBackupAt: number | null;
  paused: string | null;
}

export type ShareKind = "chapter" | "workspace";

export interface Share {
  id: string;
  url: string;
  bookId: string;
  kind: ShareKind;
  target: string | null;
  snapshotId: string | null;
  follow: boolean;
  includeNotes: boolean;
  allowComments: boolean;
  createdAt: number;
  expiresAt: number | null;
  views: number;
}

export interface ShareInput {
  bookId: string;
  kind: ShareKind;
  target: string | null;
  freeze: boolean;
  includeNotes: boolean;
  allowComments: boolean;
  expiresInDays: number | null;
}

export interface ShareChange {
  freeze?: boolean;
  includeNotes?: boolean;
  allowComments?: boolean;
  expiresInDays?: number;
  clearExpiry?: boolean;
}

export interface CloudStatus {
  bookId: string;
  state: "sending" | "ok" | "offline" | "error";
  lastBackupAt: number | null;
  message: string | null;
}
```

- [ ] **Step 2: API wrappers**

Create `src/api/cloud.ts`:

```ts
import { call } from "./invoke";
import type {
  BookCloudView, BookMeta, BookSummary, CloudOverview, KeyInfo, NewKey, RemoteBookView, Share, ShareChange,
  ShareInput, Snapshot, VaultInfo,
} from "./types";

export const cloudOverview = () => call<CloudOverview>("cloud_overview");
export const cloudSetApiUrl = (url: string) => call<CloudOverview>("cloud_set_api_url", { url });
export const cloudActivate = (label: string) => call<CloudOverview>("cloud_activate", { label });
export const cloudConnect = (secret: string) => call<CloudOverview>("cloud_connect", { secret });
export const cloudVaultInfo = () => call<VaultInfo>("cloud_vault_info");
export const cloudKeys = () => call<KeyInfo[]>("cloud_keys");
export const cloudAddKey = (label: string) => call<NewKey>("cloud_add_key", { label });
export const cloudRevokeKey = (id: string) => call<KeyInfo[]>("cloud_revoke_key", { id });
export const cloudDeleteVault = () => call<CloudOverview>("cloud_delete_vault");
export const cloudRemoteBooks = () => call<RemoteBookView[]>("cloud_remote_books");

export const cloudBookState = (bookId: string) => call<BookCloudView>("cloud_book_state", { bookId });
export const cloudSetEnabled = (bookId: string, enabled: boolean) => call<BookCloudView>("cloud_set_enabled", { bookId, enabled });
export const cloudBackup = (bookId: string, manual: boolean) => call<BookCloudView>("cloud_backup", { bookId, manual });
export const cloudSnapshots = (bookId: string) => call<Snapshot[]>("cloud_snapshots", { bookId });
export const cloudForgetBook = (bookId: string) => call<BookCloudView>("cloud_forget_book", { bookId });
export const cloudBackupOnClose = () => call<void>("cloud_backup_on_close");
export const cloudRestore = (bookId: string, snapshotId: string) => call<BookMeta>("cloud_restore", { bookId, snapshotId });
export const cloudDownload = (bookId: string) => call<BookSummary>("cloud_download", { bookId });

export const cloudShares = (bookId: string) => call<Share[]>("cloud_shares", { bookId });
export const cloudShareCreate = (input: ShareInput) => call<Share>("cloud_share_create", { input });
export const cloudShareChange = (bookId: string, id: string, change: ShareChange) => call<Share>("cloud_share_change", { bookId, id, change });
export const cloudShareRevoke = (id: string) => call<void>("cloud_share_revoke", { id });
/** Offset: local minus UTC in minutes. */
export const cloudFetchComments = (bookId: string, utcOffsetMin: number) => call<number>("cloud_fetch_comments", { bookId, utcOffsetMin });
```

- [ ] **Step 3: Mock**

In `src/api/mock/db.ts`, add:

```ts
import type { Share, Snapshot } from "../types";

export interface MockCloudBook {
  enabled: boolean;
  lastBackupAt: number | null;
  snapshots: Snapshot[];
}

/** In-memory vault for the browser build. */
export const cloudDb = {
  apiUrl: "https://kingtimer12.dev/api/scribalis/v1",
  connected: false,
  books: {} as Record<string, MockCloudBook>,
  shares: [] as Share[],
  /** Comments waiting on the server, per book: [nodeId, text]. */
  comments: {} as Record<string, [string, string][]>,
};
```

In `toSummary`, add `cloud: !!cloudDb.books[b.id]?.lastBackupAt,` to the returned object.

Create `src/api/mock/cloud.ts`:

```ts
import type { BookCloudView, CloudOverview, Share, ShareInput, Snapshot } from "../types";
import { cloudDb, findBook, mockId, toBookMeta, toSummary } from "./db";

const DEFAULT_URL = "https://kingtimer12.dev/api/scribalis/v1";

const overview = (): CloudOverview => ({ apiUrl: cloudDb.apiUrl, defaultApiUrl: DEFAULT_URL, connected: cloudDb.connected });

const bookState = (bookId: string): BookCloudView => {
  const b = cloudDb.books[bookId];
  return { enabled: !!b?.enabled, lastBackupAt: b?.lastBackupAt ?? null, paused: null };
};

function snapshot(bookId: string) {
  const b = (cloudDb.books[bookId] ??= { enabled: true, lastBackupAt: null, snapshots: [] });
  const s: Snapshot = { id: mockId(), createdAt: Date.now(), note: null, fileCount: 3, totalSize: 1000 };
  b.snapshots = [s, ...b.snapshots].slice(0, 3);
  b.lastBackupAt = s.createdAt;
}

function needVault() {
  if (!cloudDb.connected) throw "A nuvem ainda não foi ativada neste computador.";
}

/** Browser stand-in: a vault that lives in memory. Restore keeps the book as is. */
export const cloud = {
  cloud_overview: overview,
  cloud_set_api_url: ({ url }: { url: string }) => {
    if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(url.trim())) throw "Endereço inválido. Use https://…";
    cloudDb.apiUrl = url.trim().replace(/\/+$/, "");
    return overview();
  },
  cloud_activate: () => {
    cloudDb.connected = true;
    return overview();
  },
  cloud_connect: ({ secret }: { secret: string }) => {
    if (!secret.trim().startsWith("scb_")) throw "Código inválido. Ele começa com scb_.";
    cloudDb.connected = true;
    return overview();
  },
  cloud_vault_info: () => {
    needVault();
    return { id: "vlt_mock", keyId: "key_mock", createdAt: Date.now(), books: Object.keys(cloudDb.books).length, usage: { bytes: 1_200_000, quota: 1_073_741_824 } };
  },
  cloud_keys: () => [{ id: "key_mock", label: "Este computador", createdAt: Date.now(), lastUsedAt: Date.now(), current: true }],
  cloud_add_key: ({ label }: { label: string }) => ({ id: mockId(), label, secret: "scb_mockmockmock" }),
  cloud_revoke_key: () => cloud.cloud_keys(),
  cloud_delete_vault: () => {
    cloudDb.connected = false;
    cloudDb.books = {};
    cloudDb.shares = [];
    return overview();
  },
  cloud_remote_books: () => {
    needVault();
    return Object.entries(cloudDb.books)
      .filter(([, b]) => b.lastBackupAt)
      .map(([id, b]) => ({ id, title: findBook(id).title, snapshots: b.snapshots.length, latestAt: b.lastBackupAt, openComments: 0, local: true }));
  },
  cloud_book_state: ({ bookId }: { bookId: string }) => bookState(bookId),
  cloud_set_enabled: ({ bookId, enabled }: { bookId: string; enabled: boolean }) => {
    needVault();
    (cloudDb.books[bookId] ??= { enabled, lastBackupAt: null, snapshots: [] }).enabled = enabled;
    if (enabled) snapshot(bookId);
    return bookState(bookId);
  },
  cloud_backup: ({ bookId, manual }: { bookId: string; manual: boolean }) => {
    if (!cloudDb.books[bookId]?.enabled) {
      if (manual) throw "Ative o backup desta obra primeiro.";
      return bookState(bookId);
    }
    snapshot(bookId);
    return bookState(bookId);
  },
  cloud_snapshots: ({ bookId }: { bookId: string }) => cloudDb.books[bookId]?.snapshots ?? [],
  cloud_forget_book: ({ bookId }: { bookId: string }) => {
    delete cloudDb.books[bookId];
    return bookState(bookId);
  },
  cloud_backup_on_close: () => undefined,
  cloud_restore: ({ bookId }: { bookId: string }) => toBookMeta(findBook(bookId)),
  cloud_download: ({ bookId }: { bookId: string }) => toSummary(findBook(bookId)),
  cloud_shares: ({ bookId }: { bookId: string }) => cloudDb.shares.filter((s) => s.bookId === bookId),
  cloud_share_create: ({ input }: { input: ShareInput }) => {
    needVault();
    (cloudDb.books[input.bookId] ??= { enabled: true, lastBackupAt: null, snapshots: [] }).enabled = true;
    snapshot(input.bookId);
    const share: Share = {
      id: mockId(), url: "https://kingtimer12.dev/scribalis/s/" + mockId(), bookId: input.bookId, kind: input.kind,
      target: input.target, snapshotId: input.freeze ? cloudDb.books[input.bookId].snapshots[0].id : null,
      follow: !input.freeze, includeNotes: input.includeNotes, allowComments: input.allowComments,
      createdAt: Date.now(), expiresAt: input.expiresInDays ? Date.now() + input.expiresInDays * 86_400_000 : null, views: 0,
    };
    cloudDb.shares.unshift(share);
    return share;
  },
  cloud_share_change: ({ id, change }: { id: string; change: Partial<Share> & { clearExpiry?: boolean; expiresInDays?: number } }) => {
    const s = cloudDb.shares.find((x) => x.id === id);
    if (!s) throw "Link não encontrado";
    if (change.includeNotes !== undefined) s.includeNotes = change.includeNotes;
    if (change.allowComments !== undefined) s.allowComments = change.allowComments;
    if (change.clearExpiry) s.expiresAt = null;
    if (change.expiresInDays) s.expiresAt = Date.now() + change.expiresInDays * 86_400_000;
    return s;
  },
  cloud_share_revoke: ({ id }: { id: string }) => {
    cloudDb.shares = cloudDb.shares.filter((s) => s.id !== id);
  },
  cloud_fetch_comments: ({ bookId }: { bookId: string }) => {
    const waiting = cloudDb.comments[bookId] ?? [];
    const book = findBook(bookId);
    for (const [nodeId, text] of waiting) {
      const c = book.chapters.find((x) => x.id === nodeId);
      if (c) c.notes = (c.notes.trim() ? c.notes.trim() + "\n\n" : "") + "— Visitante · " + text;
    }
    cloudDb.comments[bookId] = [];
    return waiting.length;
  },
};
```

If `db.ts` does not export a `BookMeta` builder named `toBookMeta`, export the function that `mock/book.ts` uses for `book_open` under that name (for example move it from `mock/book.ts` into `db.ts`), and use it in both places.

In `src/api/mock/index.ts` import `{ cloud }` and add `...cloud` to `handlers`.

- [ ] **Step 4: State**

- In `src/lib/types.ts`: `export type Panel = "palette" | "index" | "notes" | "help" | "spacing" | "cloud";`.
- In `src/store/focus.ts` `FocusTarget`: add `| "cloud"`.
- In `src/store/state.ts`:
  - Import `BookCloudView, CloudOverview, CloudStatus, ShareKind` from `../api/types`.
  - Add these to `AppState`:

```ts
  // cloud
  cloud: CloudOverview | null;
  /** Backup state of the open book. */
  cloudBook: BookCloudView | null;
  /** Last status event from the Rust backup (any book). */
  cloudStatus: CloudStatus | null;
  /** Link being created from a context menu or command: opens the share form in the cloud panel. */
  shareDraft: ShareDraft | null;
```

  - Add the interface above `AppState`:

```ts
export interface ShareDraft {
  kind: ShareKind;
  target: string | null;
  /** What the form says is being shared ("Capítulo 03", "Área de trabalho", item title). */
  label: string;
}
```

  - In the `createStore` initial state: `cloud: null, cloudBook: null, cloudStatus: null, shareDraft: null,`.

- [ ] **Step 5: Write the failing tests**

Create `src/store/actions/cloud.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudDb } from "../../api/mock/db";
import { listLibrary } from "../../api/library";
import { setState, state } from "../state";
import { activateCloud, backupNow, createShare, fetchComments, loadBookCloud, setBookBackup } from "./cloud";
import { openBook } from "./library";

async function openFirstBook() {
  const { books } = await listLibrary();
  await openBook(books[0].id);
  return books[0].id;
}

describe("cloud actions", () => {
  beforeEach(() => {
    cloudDb.connected = false;
    cloudDb.books = {};
    cloudDb.shares = [];
    cloudDb.comments = {};
    setState({ cloud: null, cloudBook: null, toast: "" });
  });

  it("activating the vault marks it connected", async () => {
    await activateCloud("Casa");
    expect(state.cloud?.connected).toBe(true);
  });

  it("enabling a book backs it up and lights the cover badge", async () => {
    await activateCloud("Casa");
    const id = await openFirstBook();
    await setBookBackup(true);
    expect(state.cloudBook?.enabled).toBe(true);
    expect(state.cloudBook?.lastBackupAt).not.toBeNull();
    const { books } = await listLibrary();
    expect(books.find((b) => b.id === id)?.cloud).toBe(true);
    expect(books.filter((b) => b.cloud)).toHaveLength(1);
  });

  it("manual backup on a disabled book shows the reason", async () => {
    await activateCloud("Casa");
    await openFirstBook();
    await backupNow();
    expect(state.toast).toBe("Ative o backup desta obra primeiro.");
  });

  it("creating a link copies its URL", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await activateCloud("Casa");
    const id = await openFirstBook();
    await createShare({ bookId: id, kind: "chapter", target: state.book!.chapters[0].id, freeze: false, includeNotes: false, allowComments: true, expiresInDays: null });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/scribalis/s/"));
    expect(state.toast).toBe("Link copiado");
    vi.unstubAllGlobals();
  });

  it("fetched comments land in the chapter notes of the open book", async () => {
    await activateCloud("Casa");
    const id = await openFirstBook();
    await loadBookCloud(id);
    const chapterId = state.book!.chapters[state.book!.cur].id;
    cloudDb.comments[id] = [[chapterId, "achei confuso"]];
    await fetchComments(false);
    expect(state.book!.chapters[state.book!.cur].notes).toContain("achei confuso");
    expect(state.toast).toBe("1 comentário adicionado às notas");
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `bun run test src/store/actions/cloud.test.ts`
Expected: FAIL, `Failed to resolve import "./cloud"`.

- [ ] **Step 7: Implement actions**

Create `src/store/actions/cloud.ts`:

```ts
import * as bookApi from "../../api/book";
import * as api from "../../api/cloud";
import type { CloudStatus, ShareInput } from "../../api/types";
import { areaTree } from "../../api/workspace";
import { flushAll } from "../saving";
import { editBook, setState, state } from "../state";
import { flash, flashError } from "./ui";

export async function loadCloud() {
  try {
    setState("cloud", await api.cloudOverview());
  } catch (e) {
    flashError(e);
  }
}

export async function setApiUrl(url: string) {
  try {
    setState("cloud", await api.cloudSetApiUrl(url));
    flash("Endereço da nuvem salvo");
  } catch (e) {
    flashError(e);
  }
}

export async function activateCloud(label: string) {
  try {
    setState("cloud", await api.cloudActivate(label || "Meu computador"));
    flash("Nuvem ativada");
  } catch (e) {
    flashError(e);
  }
}

export async function connectCloud(secret: string) {
  try {
    setState("cloud", await api.cloudConnect(secret));
    flash("Conectado ao cofre");
    await syncCloudBadges();
  } catch (e) {
    flashError(e);
  }
}

export async function deleteVault() {
  try {
    setState("cloud", await api.cloudDeleteVault());
    setState("library", (list) => list.map((b) => ({ ...b, cloud: false })));
    flash("Cofre apagado");
  } catch (e) {
    flashError(e);
  }
}

/** Refreshes the "Nuvem" badges from the server; silent offline. */
export async function syncCloudBadges() {
  if (!state.cloud?.connected) return;
  try {
    const remote = await api.cloudRemoteBooks();
    const inVault = new Set(remote.filter((b) => b.latestAt).map((b) => b.id));
    setState("library", (list) => list.map((b) => ({ ...b, cloud: inVault.has(b.id) })));
  } catch {
    // offline: the badges keep the local cache
  }
}

export async function loadBookCloud(bookId: string) {
  try {
    const view = await api.cloudBookState(bookId);
    if (state.book?.id === bookId) setState("cloudBook", view);
    return view;
  } catch {
    return null;
  }
}

export async function setBookBackup(enabled: boolean) {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    setState("cloudBook", await api.cloudSetEnabled(id, enabled));
    flash(enabled ? "Backup ligado" : "Backup desligado");
  } catch (e) {
    flashError(e);
    void loadBookCloud(id);
  }
}

export async function backupNow() {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    setState("cloudBook", await api.cloudBackup(id, true));
    flash("Backup feito");
  } catch (e) {
    flashError(e);
  }
}

/** Automatic backup when leaving a book; errors show up in the bottom bar status, not as toasts. */
export function backupAuto(bookId: string) {
  void api.cloudBackup(bookId, false).catch(() => {});
}

export async function backupOnClose() {
  await api.cloudBackupOnClose().catch(() => {});
}

export async function forgetBook() {
  const id = state.book?.id;
  if (!id) return;
  try {
    setState("cloudBook", await api.cloudForgetBook(id));
    setState("library", (list) => list.map((b) => (b.id === id ? { ...b, cloud: false } : b)));
    flash("Obra apagada da nuvem");
  } catch (e) {
    flashError(e);
  }
}

/** Replaces the open book with a backup, then reopens it. */
export async function restoreSnapshot(snapshotId: string) {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    flash("Restaurando…");
    await api.cloudRestore(id, snapshotId);
    const { openBook } = await import("./library");
    await openBook(id);
    flash("Backup restaurado");
  } catch (e) {
    flashError(e);
  }
}

export async function downloadBook(bookId: string) {
  try {
    const summary = await api.cloudDownload(bookId);
    setState("library", (list) => [summary, ...list.filter((b) => b.id !== bookId)]);
    flash("Obra baixada");
  } catch (e) {
    flashError(e);
  }
}

export async function createShare(input: ShareInput) {
  try {
    await flushAll();
    const share = await api.cloudShareCreate(input);
    await navigator.clipboard.writeText(share.url);
    setState("shareDraft", null);
    void loadBookCloud(input.bookId);
    flash("Link copiado");
    return share;
  } catch (e) {
    flashError(e);
    return null;
  }
}

/** Pulls visitors' comments into the notes. `quiet`: no toast when there is nothing new or no network. */
export async function fetchComments(quiet: boolean) {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    const added = await api.cloudFetchComments(id, -new Date().getTimezoneOffset());
    if (added > 0) {
      await reloadNotes(id);
      flash(added === 1 ? "1 comentário adicionado às notas" : `${added} comentários adicionados às notas`);
    } else if (!quiet) {
      flash("Nenhum comentário novo");
    }
  } catch (e) {
    if (!quiet) flashError(e);
  }
}

/** Copies fresh notes into the open book without touching the chapter being edited. */
async function reloadNotes(bookId: string) {
  const meta = await bookApi.openBook(bookId);
  if (state.book?.id !== bookId) return;
  editBook((b) => {
    for (const c of b.chapters) c.notes = meta.chapters.find((x) => x.id === c.id)?.notes ?? c.notes;
  });
  if (state.view === "workspace") setState("area", await areaTree(bookId));
}

export function applyCloudStatus(s: CloudStatus) {
  setState("cloudStatus", s);
  if (s.lastBackupAt) setState("library", (list) => list.map((b) => (b.id === s.bookId ? { ...b, cloud: true } : b)));
  if (state.book?.id === s.bookId && state.cloudBook) setState("cloudBook", "lastBackupAt", s.lastBackupAt);
}
```

The dynamic `import("./library")` avoids a cycle, because `library.ts` imports `backupAuto` in Task 16. If the project has no cycle issue, a static import is fine.

- [ ] **Step 8: Run tests and typecheck**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: all tests pass, including the 5 new ones; no type errors. Summaries built elsewhere must now include `cloud`: fix any `BookSummary` literal the typecheck points to by adding `cloud: false`.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(cloud): front API, browser mock, state and actions"
```

---

### Task 14: Notes drawer on the right, with "Buscar comentários"

**Files:**
- Modify: `src/components/panels/NotesPanel.tsx`
- Modify: `src/styles/global.css` (`.notes` block around line 830; add `.drawer.right`)

**Interfaces:**
- Consumes: `fetchComments(quiet)`, `state.cloudBook`.

- [ ] **Step 1: CSS**

In `src/styles/global.css`, in the panels section, after the `.drawer` block, add:

```css
  /* Same drawer, docked on the right (notes, cloud). */
  .drawer.right {
    left: auto;
    right: 0;
    border-right: 0;
    border-left: 1px solid var(--faint);
    animation: slideR 0.22s ease-out;
  }
  .drawer-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
```

Delete the `.notes { … }` block (the floating card). It is no longer used.

- [ ] **Step 2: Component**

Replace `src/components/panels/NotesPanel.tsx`:

```tsx
import { Show } from "solid-js";
import { pad } from "../../lib/format";
import { setChapterNotes } from "../../store/actions/chapters";
import { fetchComments } from "../../store/actions/cloud";
import { focusRef } from "../../store/focus";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { SrLabel } from "../ui/SrLabel";

/** Notes for the current chapter (Ctrl ;), in a drawer on the right. */
export function NotesPanel() {
  return (
    <>
      <Scrim />
      <div class="drawer right">
        <div class="ui cap">Notas · Capítulo {pad((state.book?.cur ?? 0) + 1)}</div>
        <SrLabel for="ch-notes">Notas do capítulo</SrLabel>
        <textarea
          id="ch-notes"
          class="notes-ta"
          value={currentChapter()?.notes ?? ""}
          onInput={(e) => setChapterNotes(e.currentTarget.value)}
          ref={focusRef("notes")}
          placeholder="Ideias, pendências, lembretes de continuidade…"
        />
        <div class="drawer-foot">
          <Hint keys="Esc">voltar ao texto</Hint>
          <Show when={state.cloudBook?.enabled}>
            <button class="ui crumb" onClick={() => void fetchComments(false)}>
              Buscar comentários
            </button>
          </Show>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc --noEmit -p . && bun run test`
Expected: pass.
Run: `bun run dev`, open `http://localhost:1420`, open a book, press `Ctrl ;`. The notes drawer should slide in from the right at full height over a scrim. Typing saves. `Esc` closes. Clicking the scrim closes.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(notes): chapter notes in a right-side drawer with a comments fetch button"
```

---

### Task 15: Cloud drawer (`Ctrl Shift S`), palette, help, workspace menu

**Files:**
- Create: `src/components/cloud/CloudPanel.tsx`, `BookCloudSection.tsx`, `SnapshotList.tsx`, `ShareList.tsx`, `ShareForm.tsx`, `VaultSection.tsx`, `KeyList.tsx`
- Modify: `src/App.tsx` (render panel)
- Modify: `src/store/keys/global.ts` (shortcut)
- Modify: `src/store/commands/palette.ts`, `src/data/shortcuts.ts`, `src/components/workspace/treeMenu.ts`
- Modify: `src/styles/global.css` (cloud styles)

**Interfaces:**
- Consumes: every action in Task 13, plus `api/cloud` list calls (`cloudSnapshots`, `cloudShares`, `cloudShareChange`, `cloudShareRevoke`, `cloudVaultInfo`, `cloudKeys`, `cloudAddKey`, `cloudRevokeKey`, `cloudRemoteBooks`) through local resources inside the components. Those lists are screen state and never enter the store.

- [ ] **Step 1: CSS**

Append to the panels section of `global.css`:

```css
  .cloud-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 22px;
    scrollbar-width: none;
  }
  .cloud-sec {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .cloud-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 14px;
  }
  .cloud-btn {
    border: 1px solid var(--faint);
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 6px 10px;
    cursor: pointer;
  }
  .cloud-btn:hover,
  .cloud-btn:focus-visible {
    background: var(--soft);
  }
  .cloud-btn.danger {
    color: var(--accent);
  }
  .cloud-btn.armed {
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .cloud-input {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--faint);
    border-radius: 8px;
    background: transparent;
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 7px 9px;
  }
  .cloud-warn {
    font-size: 11px;
    color: var(--muted);
    line-height: 1.5;
  }
```

- [ ] **Step 2: Small components**

Create `src/components/cloud/SnapshotList.tsx`:

```tsx
import { createResource, createSignal, For, Show } from "solid-js";
import { cloudSnapshots } from "../../api/cloud";
import { ago } from "../../lib/format";
import { restoreSnapshot } from "../../store/actions/cloud";
import { state } from "../../store/state";

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1).replace(".", ",") + " MB";

/** The book's backups on the server; "Restaurar" needs a second click to run. */
export function SnapshotList() {
  const [list] = createResource(() => state.cloudBook?.lastBackupAt ?? 0, () => cloudSnapshots(state.book!.id));
  const [armed, setArmed] = createSignal<string | null>(null);

  return (
    <div class="cloud-sec">
      <div class="ui cap">Backups</div>
      <Show when={!list.loading} fallback={<div class="ui">Carregando…</div>}>
        <For each={list() ?? []} fallback={<div class="ui">Nenhum backup ainda.</div>}>
          {(s) => (
            <div class="cloud-row">
              <span>
                {ago(s.createdAt)} · {s.fileCount} arq. · {mb(s.totalSize)}
              </span>
              <button
                class="cloud-btn danger"
                classList={{ armed: armed() === s.id }}
                onClick={() => (armed() === s.id ? void restoreSnapshot(s.id) : setArmed(s.id))}
                onBlur={() => armed() === s.id && setArmed(null)}
              >
                {armed() === s.id ? "Confirmar: substituir a obra" : "Restaurar"}
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
```

Create `src/components/cloud/ShareForm.tsx`:

```tsx
import { createSignal } from "solid-js";
import { createShare } from "../../store/actions/cloud";
import { setState, state, type ShareDraft } from "../../store/state";

const EXPIRY: [string, number | null][] = [["nunca", null], ["1 dia", 1], ["7 dias", 7], ["30 dias", 30]];

/** Options for a new link; creating copies its URL. */
export function ShareForm(props: { draft: ShareDraft; onDone: () => void }) {
  const [comments, setComments] = createSignal(true);
  const [notes, setNotes] = createSignal(false);
  const [freeze, setFreeze] = createSignal(false);
  const [expiry, setExpiry] = createSignal<number | null>(null);

  const submit = async () => {
    const book = state.book;
    if (!book) return;
    const share = await createShare({
      bookId: book.id, kind: props.draft.kind, target: props.draft.target, freeze: freeze(),
      includeNotes: notes(), allowComments: comments(), expiresInDays: expiry(),
    });
    if (share) props.onDone();
  };

  return (
    <div class="cloud-sec">
      <div class="ui cap">Compartilhar · {props.draft.label}</div>
      {!state.cloudBook?.enabled && <div class="cloud-warn">O backup desta obra será ligado: o link mostra o último backup.</div>}
      <label class="cloud-row">
        Comentários <input type="checkbox" checked={comments()} onChange={(e) => setComments(e.currentTarget.checked)} />
      </label>
      <label class="cloud-row">
        Incluir notas <input type="checkbox" checked={notes()} onChange={(e) => setNotes(e.currentTarget.checked)} />
      </label>
      <label class="cloud-row">
        Congelar esta versão <input type="checkbox" checked={freeze()} onChange={(e) => setFreeze(e.currentTarget.checked)} />
      </label>
      <label class="cloud-row">
        Expira
        <select class="cloud-input" style={{ width: "auto" }} onChange={(e) => setExpiry(EXPIRY[Number(e.currentTarget.value)][1])}>
          {EXPIRY.map(([label], i) => <option value={i}>{label}</option>)}
        </select>
      </label>
      <div class="cloud-row">
        <button class="cloud-btn" onClick={() => { setState("shareDraft", null); props.onDone(); }}>Cancelar</button>
        <button class="cloud-btn" onClick={() => void submit()}>Criar e copiar link</button>
      </div>
    </div>
  );
}
```

Create `src/components/cloud/ShareList.tsx`:

```tsx
import { createResource, createSignal, For, Show } from "solid-js";
import { cloudShareChange, cloudShareRevoke, cloudShares } from "../../api/cloud";
import type { Share } from "../../api/types";
import { ago } from "../../lib/format";
import { flash, flashError } from "../../store/actions/ui";
import { state } from "../../store/state";

function describe(s: Share) {
  const what = s.kind === "chapter" ? "Capítulo" : s.target ? "Item da área" : "Área de trabalho";
  const until = s.expiresAt ? " · expira " + ago(s.expiresAt) : "";
  return `${what} · ${s.views} visitas · ${s.allowComments ? "com" : "sem"} comentários${until}`;
}

/** Links of the open book: copy, toggle comments, revoke (second click confirms). */
export function ShareList(props: { refresh: number }) {
  const [list, { mutate, refetch }] = createResource(() => props.refresh + 1, () => cloudShares(state.book!.id));
  const [armed, setArmed] = createSignal<string | null>(null);

  const toggleComments = async (s: Share) => {
    try {
      const next = await cloudShareChange(state.book!.id, s.id, { allowComments: !s.allowComments });
      mutate((l) => l?.map((x) => (x.id === s.id ? next : x)));
    } catch (e) {
      flashError(e);
    }
  };
  const revoke = async (s: Share) => {
    try {
      await cloudShareRevoke(s.id);
      await refetch();
      flash("Link revogado");
    } catch (e) {
      flashError(e);
    }
  };

  return (
    <Show when={(list() ?? []).length > 0}>
      <div class="cloud-sec">
        <div class="ui cap">Links</div>
        <For each={list()}>
          {(s) => (
            <div class="cloud-sec" style={{ gap: "6px" }}>
              <div class="ui">{describe(s)}</div>
              <div class="cloud-row" style={{ "justify-content": "flex-start" }}>
                <button class="cloud-btn" onClick={() => void navigator.clipboard.writeText(s.url).then(() => flash("Link copiado"))}>Copiar</button>
                <button class="cloud-btn" onClick={() => void toggleComments(s)}>{s.allowComments ? "Desligar comentários" : "Ligar comentários"}</button>
                <button
                  class="cloud-btn danger"
                  classList={{ armed: armed() === s.id }}
                  onClick={() => (armed() === s.id ? void revoke(s) : setArmed(s.id))}
                  onBlur={() => armed() === s.id && setArmed(null)}
                >
                  {armed() === s.id ? "Confirmar" : "Revogar"}
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
```

Create `src/components/cloud/KeyList.tsx`:

```tsx
import { createResource, createSignal, For, Show } from "solid-js";
import { cloudAddKey, cloudKeys, cloudRevokeKey } from "../../api/cloud";
import type { NewKey } from "../../api/types";
import { flash, flashError } from "../../store/actions/ui";

/** Device keys; a new one is shown once, to paste on the other computer. */
export function KeyList() {
  const [keys, { mutate }] = createResource(cloudKeys);
  const [fresh, setFresh] = createSignal<NewKey | null>(null);
  const [armed, setArmed] = createSignal<string | null>(null);

  const add = async () => {
    try {
      setFresh(await cloudAddKey("Outro computador"));
      mutate(await cloudKeys());
    } catch (e) {
      flashError(e);
    }
  };
  const revoke = async (id: string) => {
    try {
      mutate(await cloudRevokeKey(id));
      flash("Chave revogada");
    } catch (e) {
      flashError(e);
    }
  };

  return (
    <div class="cloud-sec">
      <div class="ui cap">Computadores</div>
      <For each={keys() ?? []}>
        {(k) => (
          <div class="cloud-row">
            <span>{k.label}{k.current ? " (este computador)" : ""}</span>
            <Show when={!k.current}>
              <button
                class="cloud-btn danger"
                classList={{ armed: armed() === k.id }}
                onClick={() => (armed() === k.id ? void revoke(k.id) : setArmed(k.id))}
                onBlur={() => armed() === k.id && setArmed(null)}
              >
                {armed() === k.id ? "Confirmar" : "Revogar"}
              </button>
            </Show>
          </div>
        )}
      </For>
      <Show
        when={fresh()}
        fallback={<button class="cloud-btn" onClick={() => void add()}>Adicionar computador</button>}
      >
        {(k) => (
          <div class="cloud-sec" style={{ gap: "6px" }}>
            <div class="cloud-warn">Cole este código no outro computador, em "Conectar a um cofre". Quem tiver este código acessa todas as obras do cofre.</div>
            <input class="cloud-input" readOnly value={k().secret} onFocus={(e) => e.currentTarget.select()} />
            <button class="cloud-btn" onClick={() => void navigator.clipboard.writeText(k().secret).then(() => flash("Código copiado"))}>Copiar código</button>
          </div>
        )}
      </Show>
    </div>
  );
}
```

- [ ] **Step 3: Sections and shell**

Create `src/components/cloud/BookCloudSection.tsx`:

```tsx
import { createSignal, Show } from "solid-js";
import { ago, pad } from "../../lib/format";
import { backupNow, fetchComments, forgetBook, setBookBackup } from "../../store/actions/cloud";
import { setState, state } from "../../store/state";
import { ShareForm } from "./ShareForm";
import { ShareList } from "./ShareList";
import { SnapshotList } from "./SnapshotList";

/** "Esta obra": backup toggle and state, backups, links, comments, removal from the server. */
export function BookCloudSection() {
  const [armed, setArmed] = createSignal(false);
  const [refresh, setRefresh] = createSignal(0);
  const view = () => state.cloudBook;
  const shareChapter = () =>
    setState("shareDraft", { kind: "chapter", target: state.book!.chapters[state.book!.cur].id, label: "Capítulo " + pad(state.book!.cur + 1) });
  const shareArea = () => setState("shareDraft", { kind: "workspace", target: null, label: "Área de trabalho" });

  return (
    <div class="cloud-sec">
      <div class="ui cap">Esta obra</div>
      <label class="cloud-row">
        Backup na nuvem
        <input type="checkbox" checked={!!view()?.enabled} onChange={(e) => void setBookBackup(e.currentTarget.checked)} />
      </label>
      <Show when={view()?.enabled}>
        <div class="ui">
          {view()?.lastBackupAt ? "Último backup: " + ago(view()!.lastBackupAt!) : "Sem backup ainda"}
          {view()?.paused ? " · backups automáticos parados: " + view()!.paused : ""}
        </div>
        <div class="cloud-row" style={{ "justify-content": "flex-start" }}>
          <button class="cloud-btn" onClick={() => void backupNow()}>Fazer backup agora</button>
          <button class="cloud-btn" onClick={() => void fetchComments(false)}>Buscar comentários</button>
        </div>
        <SnapshotList />
      </Show>
      <Show
        when={state.shareDraft}
        fallback={
          <div class="cloud-row" style={{ "justify-content": "flex-start" }}>
            <button class="cloud-btn" onClick={shareChapter}>Compartilhar capítulo atual</button>
            <button class="cloud-btn" onClick={shareArea}>Compartilhar área de trabalho</button>
          </div>
        }
      >
        {(draft) => <ShareForm draft={draft()} onDone={() => setRefresh((n) => n + 1)} />}
      </Show>
      <ShareList refresh={refresh()} />
      <Show when={view()?.lastBackupAt}>
        <button
          class="cloud-btn danger"
          classList={{ armed: armed() }}
          onClick={() => (armed() ? void forgetBook() : setArmed(true))}
          onBlur={() => setArmed(false)}
        >
          {armed() ? "Confirmar: apagar da nuvem (os links param)" : "Apagar da nuvem"}
        </button>
      </Show>
    </div>
  );
}
```

Create `src/components/cloud/VaultSection.tsx`:

```tsx
import { createEffect, createResource, createSignal, For, on, Show } from "solid-js";
import { cloudRemoteBooks, cloudVaultInfo } from "../../api/cloud";
import { activateCloud, connectCloud, deleteVault, downloadBook, setApiUrl } from "../../store/actions/cloud";
import { state } from "../../store/state";
import { KeyList } from "./KeyList";

const mb = (bytes: number) => Math.round(bytes / 1_048_576).toLocaleString("pt-BR") + " MB";

/** "Geral": server address, activate/connect, usage, other computers, books only in the vault. */
export function VaultSection() {
  const [url, setUrl] = createSignal(state.cloud?.apiUrl ?? "");
  // The overview may arrive after the panel opens (and changes after saving).
  createEffect(on(() => state.cloud?.apiUrl, (u) => u && setUrl(u)));
  const [code, setCode] = createSignal("");
  const [armed, setArmed] = createSignal(false);
  const connected = () => !!state.cloud?.connected;
  const [info] = createResource(() => connected() || null, () => cloudVaultInfo().catch(() => null));
  const [remote, { refetch }] = createResource(() => connected() || null, () => cloudRemoteBooks().catch(() => []));

  return (
    <div class="cloud-sec">
      <div class="ui cap">Nuvem</div>
      <label class="cloud-sec" style={{ gap: "6px" }}>
        <span class="ui">Endereço da API</span>
        <input class="cloud-input" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <Show when={state.cloud && url().trim().replace(/\/+$/, "") !== state.cloud.apiUrl}>
        <button class="cloud-btn" onClick={() => void setApiUrl(url())}>Salvar endereço</button>
        <div class="cloud-warn">As obras do cofre atual continuam no servidor antigo.</div>
      </Show>
      <Show
        when={connected()}
        fallback={
          <>
            <button class="cloud-btn" onClick={() => void activateCloud("Meu computador")}>Ativar a nuvem</button>
            <input class="cloud-input" placeholder="scb_… (código de outro computador)" value={code()} onInput={(e) => setCode(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
            <button class="cloud-btn" onClick={() => void connectCloud(code())}>Conectar a um cofre</button>
          </>
        }
      >
        <Show when={info()}>{(i) => <div class="ui">{mb(i().usage.bytes)} de {mb(i().usage.quota)}</div>}</Show>
        <KeyList />
        <For each={(remote() ?? []).filter((b) => !b.local && b.latestAt)}>
          {(b) => (
            <div class="cloud-row">
              <span>{b.title || "Obra sem título"}</span>
              <button class="cloud-btn" onClick={() => void downloadBook(b.id).then(() => refetch())}>Baixar</button>
            </div>
          )}
        </For>
        <button
          class="cloud-btn danger"
          classList={{ armed: armed() }}
          onClick={() => (armed() ? void deleteVault() : setArmed(true))}
          onBlur={() => setArmed(false)}
        >
          {armed() ? "Confirmar: apagar todas as obras e links do servidor" : "Apagar cofre"}
        </button>
      </Show>
    </div>
  );
}
```

Create `src/components/cloud/CloudPanel.tsx`:

```tsx
import { onMount, Show } from "solid-js";
import { loadBookCloud, loadCloud } from "../../store/actions/cloud";
import { focusRef } from "../../store/focus";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { BookCloudSection } from "./BookCloudSection";
import { VaultSection } from "./VaultSection";

/** Cloud drawer (Ctrl Shift S): the open book on top, then the vault. */
export function CloudPanel() {
  onMount(() => {
    void loadCloud();
    if (state.book) void loadBookCloud(state.book.id);
  });

  return (
    <>
      <Scrim />
      <div class="drawer right" tabIndex={-1} ref={focusRef("cloud")}>
        <div class="cloud-scroll">
          <Show when={state.book && state.cloud?.connected}>
            <BookCloudSection />
          </Show>
          <VaultSection />
          <p class="cloud-warn">Os arquivos não são criptografados no seu computador. Quem administra o servidor consegue lê-los.</p>
        </div>
        <Hint keys="Esc">fechar</Hint>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Wiring**

- In `src/App.tsx`, import `CloudPanel` and add inside the panel `<Switch>`:

```tsx
        <Match when={state.panel === "cloud"}>
          <CloudPanel />
        </Match>
```

- In `src/store/keys/global.ts`, before the `ed && mod && !e.shiftKey && (k === "e" …` line, add:

```ts
  else if (mod && e.shiftKey && (k === "s" || code === "KeyS")) openPanel("cloud");
```

- In `src/data/shortcuts.ts`, after "Tema claro / escuro", add `{ label: "Nuvem: backup e links", keys: ["Ctrl", "Shift", "S"] },`.
- In `src/store/commands/palette.ts`:
  - In `commonCommands()` add `{ label: "Nuvem", hint: "Ctrl Shift S", act: () => openPanel("cloud") }`.
  - In `editorCommands()`, after "Copiar capítulo", add:

```ts
    { label: "Compartilhar capítulo", hint: "", act: () => { setState("shareDraft", { kind: "chapter", target: c.id, label: "Capítulo " + pad(cur + 1) }); openPanel("cloud"); } },
    ...(state.cloudBook?.enabled
      ? [
          { label: "Fazer backup agora", hint: "", act: () => void backupNow() },
          { label: "Buscar comentários", hint: "", act: () => void fetchComments(false) },
        ]
      : []),
```

  - Import `backupNow` and `fetchComments` from `../actions/cloud`.
- In `src/components/workspace/treeMenu.ts`, add a share item for every node kind. Place it before `del`:

```ts
  const share: MenuItem = {
    label: "Compartilhar…",
    act: () => {
      setState("shareDraft", { kind: "workspace", target: id, label: node.title || "Item da área" });
      openPanel("cloud");
    },
  };
```

  Then add `share` to each returned array right before `del`. Import `setState` from `../../store/state` and `openPanel` from `../../store/actions/ui`.

- [ ] **Step 5: Verify**

Run: `./node_modules/.bin/tsc --noEmit -p . && bun run test`
Expected: pass.
Run: `bun run dev`. Walk through in the browser (mock):
1. `Ctrl Shift S` opens the right drawer.
2. "Ativar a nuvem" works.
3. Open a book and press `Ctrl Shift S`. "Esta obra" shows. Turning on "Backup na nuvem" lists one backup.
4. "Compartilhar capítulo atual" opens the form, and "Criar e copiar link" shows "Link copiado".
5. "Restaurar" asks for a second click.
6. `Esc` closes the drawer.

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(cloud): cloud drawer with backups, links, keys and vault; shortcut, palette and workspace menu"
```

---

### Task 16: Badge, bottom bar status, automatic triggers

**Files:**
- Modify: `src/components/library/BookTile.tsx`
- Create: `src/components/chrome/CloudIndicator.tsx`
- Modify: `src/components/chrome/BottomBar.tsx`
- Modify: `src/store/actions/library.ts` (`openBook`, `goLibrary`)
- Modify: `src/App.tsx` (status event, close hook, initial load)
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `backupAuto`, `backupOnClose`, `loadCloud`, `loadBookCloud`, `fetchComments`, `syncCloudBadges`, `applyCloudStatus`, `BookSummary.cloud`, `state.cloudStatus`.

- [ ] **Step 1: Badge**

CSS (after `.cover-btn` rules):

```css
  .cloud-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 6px;
    border: 1px solid var(--faint);
    border-radius: 6px;
    background: var(--panel);
    color: var(--ink);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.4;
    pointer-events: none;
  }
```

In `BookTile.tsx`, inside `<button class="cover-btn" …>` after `<CoverArt … />`:

```tsx
        <Show when={props.book.cloud}>
          <span class="cloud-badge" aria-label="Guardada na nuvem">Nuvem</span>
        </Show>
```

- [ ] **Step 2: Bottom bar indicator**

Create `src/components/chrome/CloudIndicator.tsx`:

```tsx
import { Show } from "solid-js";
import { openPanel } from "../../store/actions/ui";
import { state } from "../../store/state";

const time = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Short cloud state of the open book; click opens the cloud drawer. */
export function CloudIndicator() {
  const status = () => (state.cloudStatus?.bookId === state.book?.id ? state.cloudStatus : null);
  const label = () => {
    const s = status();
    if (s?.state === "sending") return "nuvem ↑";
    if (s?.state === "offline") return "nuvem offline";
    if (s?.state === "error") return "nuvem: " + (s.message ?? "erro");
    const at = s?.lastBackupAt ?? state.cloudBook?.lastBackupAt;
    return at ? "nuvem ✓ " + time(at) : "nuvem";
  };
  return (
    <Show when={state.cloudBook?.enabled}>
      <button class="ui crumb" title="Nuvem (Ctrl Shift S)" onClick={() => openPanel("cloud")}>
        {label()}
      </button>
    </Show>
  );
}
```

In `BottomBar.tsx`, inside the right `<div class="ui flex items-center justify-end gap-3">`, in the non-library branch, before `<GoalProgress />`:

```tsx
          <CloudIndicator />
```

Wrap the two in a fragment (`<>…</>`) as needed.

- [ ] **Step 3: Triggers**

In `src/store/actions/library.ts`:
- Import `backupAuto`, `fetchComments`, `loadBookCloud` and `syncCloudBadges` from `./cloud`.
- In `openBook`, capture `const prev = state.book?.id;` before `flushAll`. After `swapDocument(...)` resolves, add:

```ts
    if (prev && prev !== id) backupAuto(prev);
    setState("cloudBook", null);
    void loadBookCloud(id).then((view) => view?.enabled && fetchComments(true));
```

- In `goLibrary`, capture `const prev = state.book?.id;` first. At the end, add:

```ts
  if (prev) backupAuto(prev);
  setState("cloudBook", null);
  void syncCloudBadges();
```

In `restoreSnapshot` (Task 13) you can now replace the dynamic import with a static one, if the typecheck and tests show no circular-import problem. Otherwise keep it.

In `src/App.tsx`:
- Import `listen` from `@tauri-apps/api/event`, the type `CloudStatus`, and `applyCloudStatus`, `backupOnClose`, `loadCloud`, `syncCloudBadges` from `./store/actions/cloud`.
- Change the close handler body to:

```ts
          await flushAll().catch(() => {});
          await backupOnClose();
```

- Inside `if (isTauri) { … }` add:

```ts
      void listen<CloudStatus>("cloud://status", (e) => applyCloudStatus(e.payload)).then(keep);
```

- After `await Promise.all([loadPrefs(), refreshLibrary()]);` add:

```ts
    await loadCloud();
    void syncCloudBadges();
```

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc --noEmit -p . && bun run test`
Expected: pass.
Run: `bun run dev`. Activate the cloud and enable a book's backup. Go back to the library (`Ctrl O`): the cover shows "Nuvem". Open the book: the bottom bar shows "nuvem ✓ hh:mm".

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat(cloud): cover badge, bottom bar status, backup on leaving a book and on close"
```

---

### Task 17: CI dependency, README, manual verification against a real server

**Files:**
- Modify: `.github/workflows/ci.yml:34`
- Modify: `.github/workflows/release.yml:43`
- Modify: `README.md`

- [ ] **Step 1: CI**

In both workflow files, add `libdbus-1-dev` to the `apt-get install -y` line. `keyring`'s Secret Service backend links libdbus on Linux:

```
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libdbus-1-dev
```

- [ ] **Step 2: README**

In `README.md`, add a section after "Atualização automática" (inside "Features"):

```markdown
### Nuvem (opcional)

- Backup automático das obras que você escolher: ao sair da obra, a cada 10 minutos e ao fechar o app. Só os
  arquivos que mudaram são enviados.
- Até 3 backups por obra; restaurar substitui a obra (o estado atual vira um backup antes).
- Leve o cofre para outro computador com um código; baixe de lá as obras que ainda não estão nele.
- Links públicos de um capítulo ou da área de trabalho, com comentários. Os comentários chegam nas notas.
- Sem conta: a chave fica no chaveiro do sistema. `Ctrl Shift S` abre o painel.
- O endereço da API é configurável. As rotas que um servidor próprio precisa ter estão em
  `docs/superpowers/specs/2026-09-28-nuvem-backup-links-design.md`.
- Os arquivos não são criptografados no seu computador: quem administra o servidor consegue lê-los.
```

Also add `Ctrl Shift S` to any shortcut list in the README, if one exists.

- [ ] **Step 3: Full test run**

Run: `cargo test --manifest-path src-tauri/Cargo.toml && bun run test && ./node_modules/.bin/tsc --noEmit -p . && bun run build`
Expected: everything passes.

- [ ] **Step 4: Manual check against a real server**

Start the server: in `~/app/timerdev`, run `bun start`, which serves `http://localhost:<port>/api/scribalis/v1`. Then run `bun run tauri dev`.

1. Press `Ctrl Shift S`. Set the address to `http://localhost:<port>/api/scribalis/v1` and save. Click "Ativar a nuvem". The keychain gets a "Scribalis" entry for that address.
2. Open a book and turn on "Backup na nuvem". One backup appears. Go back to the library: the cover shows "Nuvem".
3. Edit one chapter, leave the book, and look at the server log: only 1–2 `PUT /blobs` calls.
4. "Compartilhar capítulo atual" → "Criar e copiar link". Open the URL in a browser, select a passage, comment, and add a reply.
5. In the app, open the notes (`Ctrl ;`) and click "Buscar comentários". The thread appears in the chapter notes. Fetch again: nothing is duplicated.
6. Share a workspace item, comment on it, delete that item in the app, and fetch. The comment lands in "Comentários recebidos".
7. "Restaurar" the oldest backup. Confirm. The book shows the old text, and the library has no duplicate or hidden folder.
8. "Adicionar computador" and copy the code. Delete `cloud.json` from the app data folder and delete the keychain entry to simulate a new computer. Restart, set the address, use "Conectar a um cofre" with the code, then "Baixar" a book that you deleted locally beforehand.
9. Revoke the link: the browser page stops working.
10. Switch the address back to the default and then to localhost again: the vault state comes back.
11. Close the app right after an edit: the server log shows the backup.

Write down anything that fails, fix it, and repeat the affected step.

- [ ] **Step 5: Commit**

```bash
git add .github README.md
git commit -m "docs(cloud): README section; CI installs libdbus for the keychain"
```
