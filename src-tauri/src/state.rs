use std::{collections::HashMap, path::{Path, PathBuf}, sync::{Mutex, MutexGuard}};

use crate::error::{AppError, AppResult};
use crate::model::metadata::Metadata;
use crate::ops::manuscript::sync_mirror;
use crate::storage::migrate::open_book;

/// Runtime state managed by Tauri. Keeps only one book's metadata in memory; its tree is
/// read from disk by each operation.
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

    /// Records a book seen on disk with its word total; the first full scan fixes the
    /// daily-goal baseline. A book first seen after that (new, restored sample, copied folder)
    /// joins the baseline, so only words written in the app count as today's.
    pub fn register(&mut self, dir: &Path, id: &str, words: usize) {
        if let Some(base) = self.session_base.as_mut() {
            if !self.totals.contains_key(id) {
                *base += words;
            }
        }
        // The cached metadata belongs to another folder now: reread it next time.
        if self.open.as_ref().is_some_and(|(d, m)| m.id == id && d != dir) {
            self.open = None;
        }
        self.dirs.insert(id.to_string(), dir.to_path_buf());
        self.totals.insert(id.to_string(), words);
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

    /// The book's folder was replaced by a restored copy. The word difference joins the baseline,
    /// so the restore does not count as words written today.
    pub fn replace(&mut self, dir: &Path, id: &str, words: usize) {
        let old = self.totals.get(id).copied().unwrap_or(0);
        if let Some(base) = self.session_base.as_mut() {
            *base = (*base + words).saturating_sub(old);
        }
        if self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            self.open = None;
        }
        self.dirs.insert(id.to_string(), dir.to_path_buf());
        self.totals.insert(id.to_string(), words);
    }

    pub fn dir_of(&self, id: &str) -> AppResult<PathBuf> {
        self.dirs.get(id).cloned().ok_or_else(|| AppError::msg("Obra não encontrada"))
    }

    /// Runs `f` on the book's cached metadata, loading it (and migrating a v1 book) if needed.
    /// On error the cache is dropped so the next call rereads the disk.
    pub fn with_book<T>(&mut self, id: &str, f: impl FnOnce(&Path, &mut Metadata) -> AppResult<T>) -> AppResult<T> {
        if self.open.as_ref().is_none_or(|(_, m)| m.id != id) {
            let dir = self.dir_of(id)?;
            let meta = open_book(&dir)?;
            self.open = Some((dir, meta));
        }
        let (dir, meta) = self.open.as_mut().expect("just loaded");
        match f(dir, meta) {
            Ok(out) => {
                // Whatever the command touched, `metadata.chapters` follows the tree; the same
                // read of the tree gives the word total.
                match sync_mirror(dir, meta) {
                    Ok(total) => {
                        self.totals.insert(id.to_string(), total);
                    }
                    Err(e) => eprintln!("could not sync the chapter mirror of {id}: {e}"),
                }
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

    /// Words that entered a book without being typed (import, a text moved into the
    /// Manuscrito) join the session baseline, so today is unchanged.
    pub fn absorb(&mut self, words: usize) {
        if let Some(base) = self.session_base.as_mut() {
            *base += words;
        }
    }

    /// Words that left the chapters without being erased (a chapter moved out of the
    /// Manuscrito) keep counting, so today is unchanged.
    pub fn release(&mut self, words: usize) {
        if self.session_base.is_some() {
            self.released += words;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::manuscript::chapters;
    use crate::ops::{chapter, library::create_book};
    use crate::storage::migrate::peek_tree;

    /// Its first chapter's id: stable through the migration, so valid before and after it.
    fn first_chapter(dir: &Path, meta: &Metadata) -> String {
        chapters(&peek_tree(dir, meta).unwrap())[0].id.clone()
    }

    #[test]
    fn today_counts_words_written_after_session_start() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let c = first_chapter(&dir, &meta);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois")).map(|_| ())).unwrap();
        assert_eq!(lib.today(), 2);
    }

    #[test]
    fn books_added_or_removed_mid_session_do_not_move_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let (dir_b, meta_b) = create_book(root.path(), "B").unwrap();
        lib.register(&dir_b, &meta_b.id, 100);
        assert_eq!(lib.today(), 0);
        let c = first_chapter(&dir, &meta);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois")).map(|_| ())).unwrap();
        assert_eq!(lib.today(), 2);
        lib.forget(&meta_b.id);
        assert_eq!(lib.today(), 2);
    }

    #[test]
    fn replacing_a_book_does_not_move_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        lib.replace(&dir, &meta.id, 500);
        assert_eq!(lib.today(), 0);
        assert_eq!(lib.total_of(&meta.id), 500);
    }

    #[test]
    fn unknown_book_is_an_error() {
        let mut lib = Library::new(PathBuf::from("."));
        assert!(lib.with_book("nope", |_, _| Ok(())).is_err());
    }

    #[test]
    fn loading_a_book_migrates_it() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        let open = lib.with_book(&meta.id, |_, m| Ok(m.open.clone())).unwrap();
        assert_eq!(open, Some(first_chapter(&dir, &meta)));
        let ws = crate::storage::workspace_io::read_workspace(&dir).unwrap();
        assert_eq!(ws.version, 2);
    }

    #[test]
    fn the_metadata_mirror_follows_the_manuscript() {
        use crate::model::{metadata::Status, patches::ChapterPatch, workspace::NodeKind};
        use crate::ops::workspace;
        use crate::storage::{metadata_io::read_metadata, workspace_io::read_workspace};
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        let mirror = |d: &Path| read_metadata(d).unwrap().chapters.iter().map(|c| c.id.clone()).collect::<Vec<_>>();
        let order = |d: &Path| chapters(&read_workspace(d).unwrap().items).iter().map(|c| c.id.clone()).collect::<Vec<_>>();
        let mid = lib.with_book(&meta.id, |d, _| Ok(read_workspace(d)?.items[0].id.clone())).unwrap();
        // create
        let c2 = lib.with_book(&meta.id, |d, _| workspace::create(d, Some(&mid), 0, NodeKind::Chapter, "Novo")).unwrap().id;
        assert_eq!(mirror(&dir), order(&dir));
        assert_eq!(mirror(&dir)[0], c2);
        // rename, status, words
        lib.with_book(&meta.id, |d, _| workspace::rename(d, &c2, "Outro").map(|_| ())).unwrap();
        lib.with_book(&meta.id, |d, m| {
            chapter::update(d, m, &c2, ChapterPatch { status: Some(Status::Pronto), ..Default::default() }).map(|_| ())
        })
        .unwrap();
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c2, &parse("um dois")).map(|_| ())).unwrap();
        let first = read_metadata(&dir).unwrap().chapters[0].clone();
        assert_eq!((first.title.as_str(), first.status, first.words), ("Outro", Status::Pronto, 2));
        assert_eq!(first.file, format!("capitulos/{c2}.md"));
        // a text moved in, a chapter moved out, a delete
        let t = lib.with_book(&meta.id, |d, _| workspace::create(d, None, 1, NodeKind::Text, "Texto")).unwrap().id;
        lib.with_book(&meta.id, |d, _| workspace::move_to(d, &t, Some(&mid), 2).map(|_| ())).unwrap();
        assert_eq!(mirror(&dir), order(&dir));
        assert!(mirror(&dir).contains(&t));
        lib.with_book(&meta.id, |d, _| workspace::move_to(d, &c2, None, 2).map(|_| ())).unwrap();
        assert_eq!(mirror(&dir), order(&dir));
        assert!(!mirror(&dir).contains(&c2));
        lib.with_book(&meta.id, |d, _| workspace::delete(d, &t).map(|_| ())).unwrap();
        assert_eq!(mirror(&dir), order(&dir));
        assert_eq!(mirror(&dir).len(), 1);
    }

    #[test]
    fn absorbed_words_do_not_count_as_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let c = first_chapter(&dir, &meta);
        let before = lib.total_of(&meta.id);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois três")).map(|_| ())).unwrap();
        lib.absorb(lib.total_of(&meta.id) - before);
        assert_eq!(lib.today(), 0);
    }

    #[test]
    fn released_words_do_not_lower_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let c = first_chapter(&dir, &meta);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois")).map(|_| ())).unwrap();
        assert_eq!(lib.today(), 2);
        let before = lib.total_of(&meta.id);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("")).map(|_| ())).unwrap();
        lib.release(before - lib.total_of(&meta.id));
        assert_eq!(lib.today(), 2);
    }
}
