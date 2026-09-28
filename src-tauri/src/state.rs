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
    /// Words moved out of the chapters this session without being erased; they still count as today's.
    released: usize,
}

pub type SharedLibrary = Mutex<Library>;

pub fn lock(state: &SharedLibrary) -> AppResult<MutexGuard<'_, Library>> {
    state.lock().map_err(|_| AppError::msg("Estado interno indisponível"))
}

impl Library {
    pub fn new(root: PathBuf) -> Self {
        Self { root, dirs: HashMap::new(), open: None, totals: HashMap::new(), session_base: None, released: 0 }
    }

    /// Records a book seen on disk; the first full scan fixes the daily-goal baseline.
    /// A book first seen after that (new, restored sample, copied folder) joins the
    /// baseline, so only words written in the app count as today's.
    pub fn register(&mut self, dir: &Path, meta: &Metadata) {
        let total = meta.total_words();
        if let Some(base) = self.session_base.as_mut() {
            if !self.totals.contains_key(&meta.id) {
                *base += total;
            }
        }
        // The cached metadata belongs to another folder now: reread it next time.
        if self.open.as_ref().is_some_and(|(d, m)| m.id == meta.id && d != dir) {
            self.open = None;
        }
        self.dirs.insert(meta.id.clone(), dir.to_path_buf());
        self.totals.insert(meta.id.clone(), total);
    }

    pub fn start_session_if_needed(&mut self) {
        if self.session_base.is_none() {
            self.session_base = Some(self.totals.values().sum());
        }
    }

    /// Drops a deleted book; its words leave the baseline too, so today is unchanged.
    pub fn forget(&mut self, id: &str) -> Option<PathBuf> {
        if let (Some(total), Some(base)) = (self.totals.remove(id), self.session_base.as_mut()) {
            *base = base.saturating_sub(total);
        }
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
        (now + self.released).saturating_sub(self.session_base.unwrap_or(now))
    }

    /// Word total of a book as last seen (0 if unknown).
    pub fn total_of(&self, id: &str) -> usize {
        self.totals.get(id).copied().unwrap_or(0)
    }

    /// Words that entered a book without being typed (import, workspace text
    /// sent to chapters) join the session baseline, so today is unchanged.
    pub fn absorb(&mut self, words: usize) {
        if let Some(base) = self.session_base.as_mut() {
            *base += words;
        }
    }

    /// Words that left the chapters without being erased (a chapter sent to the
    /// workspace) keep counting, so today is unchanged.
    pub fn release(&mut self, words: usize) {
        if self.session_base.is_some() {
            self.released += words;
        }
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
    fn books_added_or_removed_mid_session_do_not_move_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta);
        lib.start_session_if_needed();
        let (dir_b, mut meta_b) = create_book(root.path(), "B").unwrap();
        meta_b.chapters[0].words = 100;
        lib.register(&dir_b, &meta_b);
        assert_eq!(lib.today(), 0);
        let chapter_id = meta.chapters[0].id.clone();
        lib.with_book(&meta.id, |d, m| {
            chapter::save(d, m, &chapter_id, &crate::markdown::parse::parse("um dois")).map(|_| ())
        })
        .unwrap();
        assert_eq!(lib.today(), 2);
        lib.forget(&meta_b.id);
        assert_eq!(lib.today(), 2);
    }

    #[test]
    fn unknown_book_is_an_error() {
        let mut lib = Library::new(PathBuf::from("."));
        assert!(lib.with_book("nope", |_, _| Ok(())).is_err());
    }

    #[test]
    fn absorbed_words_do_not_count_as_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta);
        lib.start_session_if_needed();
        let chapter_id = meta.chapters[0].id.clone();
        let before = lib.total_of(&meta.id);
        lib.with_book(&meta.id, |d, m| {
            chapter::save(d, m, &chapter_id, &crate::markdown::parse::parse("um dois três")).map(|_| ())
        })
        .unwrap();
        lib.absorb(lib.total_of(&meta.id) - before);
        assert_eq!(lib.today(), 0);
    }

    #[test]
    fn released_words_do_not_lower_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta);
        lib.start_session_if_needed();
        let chapter_id = meta.chapters[0].id.clone();
        // two words typed today
        lib.with_book(&meta.id, |d, m| {
            chapter::save(d, m, &chapter_id, &crate::markdown::parse::parse("um dois")).map(|_| ())
        })
        .unwrap();
        assert_eq!(lib.today(), 2);
        // then those words leave the chapters (sent to the workspace)
        let before = lib.total_of(&meta.id);
        lib.with_book(&meta.id, |d, m| {
            chapter::save(d, m, &chapter_id, &crate::markdown::parse::parse("")).map(|_| ())
        })
        .unwrap();
        lib.release(before - lib.total_of(&meta.id));
        assert_eq!(lib.today(), 2);
    }
}
