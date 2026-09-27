use std::{collections::HashMap, path::{Path, PathBuf}, sync::{Mutex, MutexGuard}};

use crate::error::{AppError, AppResult};
use crate::model::metadata::Metadata;
use crate::storage::metadata_io::read_metadata;

/// Runtime state managed by Tauri. Keeps only one book's metadata in memory.
pub struct Library {
    pub root: PathBuf,
    dirs: HashMap<String, PathBuf>,
    open: Option<(PathBuf, Metadata)>,
    totals: HashMap<String, usize>,
    session_base: Option<usize>,
}

pub type SharedLibrary = Mutex<Library>;

pub fn lock(state: &SharedLibrary) -> AppResult<MutexGuard<'_, Library>> {
    state.lock().map_err(|_| AppError::msg("Estado interno indisponível"))
}

impl Library {
    pub fn new(root: PathBuf) -> Self {
        Self { root, dirs: HashMap::new(), open: None, totals: HashMap::new(), session_base: None }
    }

    /// Records a book seen on disk; the first full scan fixes the daily-goal baseline.
    pub fn register(&mut self, dir: &Path, meta: &Metadata) {
        self.dirs.insert(meta.id.clone(), dir.to_path_buf());
        self.totals.insert(meta.id.clone(), meta.total_words());
    }

    pub fn start_session_if_needed(&mut self) {
        if self.session_base.is_none() {
            self.session_base = Some(self.totals.values().sum());
        }
    }

    pub fn forget(&mut self, id: &str) -> Option<PathBuf> {
        self.totals.remove(id);
        if self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            self.open = None;
        }
        self.dirs.remove(id)
    }

    pub fn dir_of(&self, id: &str) -> AppResult<PathBuf> {
        self.dirs.get(id).cloned().ok_or_else(|| AppError::msg("Obra não encontrada"))
    }

    /// Runs `f` on the book's cached metadata (loading it if needed).
    /// On error the cache is dropped so the next call rereads the disk.
    pub fn with_book<T>(&mut self, id: &str, f: impl FnOnce(&Path, &mut Metadata) -> AppResult<T>) -> AppResult<T> {
        if !self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            let dir = self.dir_of(id)?;
            let meta = read_metadata(&dir)?;
            self.open = Some((dir, meta));
        }
        let (dir, meta) = self.open.as_mut().expect("just loaded");
        match f(dir, meta) {
            Ok(out) => {
                let total = meta.total_words();
                self.totals.insert(id.to_string(), total);
                Ok(out)
            }
            Err(e) => {
                self.open = None;
                Err(e)
            }
        }
    }

    pub fn today(&self) -> usize {
        let now: usize = self.totals.values().sum();
        now.saturating_sub(self.session_base.unwrap_or(now))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::{chapter, library::create_book};

    #[test]
    fn today_counts_words_written_after_session_start() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta);
        lib.start_session_if_needed();
        let chapter_id = meta.chapters[0].id.clone();
        lib.with_book(&meta.id, |d, m| {
            chapter::save(d, m, &chapter_id, &crate::markdown::parse::parse("um dois")).map(|_| ())
        })
        .unwrap();
        assert_eq!(lib.today(), 2);
    }

    #[test]
    fn unknown_book_is_an_error() {
        let mut lib = Library::new(PathBuf::from("."));
        assert!(lib.with_book("nope", |_, _| Ok(())).is_err());
    }
}
