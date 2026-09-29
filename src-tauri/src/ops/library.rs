use std::{collections::HashSet, fs, path::{Path, PathBuf}};

use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::markdown::parse::parse;
use crate::model::{
    doc::Doc,
    manuscript,
    metadata::Metadata,
    views::BookSummary,
    workspace::{Node, Workspace},
};
use crate::ops::manuscript::new_chapter;
use crate::samples::sample_books;
use crate::storage::{
    metadata_io::{read_metadata, write_metadata},
    migrate::peek_tree,
    paths::{slugify, unique_dir, CHAPTERS_DIR, IMAGES_DIR},
    workspace_io::write_workspace,
};

pub struct Scan {
    pub books: Vec<(PathBuf, Metadata)>,
    pub warnings: Vec<String>,
}

/// Creates the imagens and capitulos directories in a book folder.
fn init_book_dirs(dir: &Path) -> AppResult<()> {
    fs::create_dir_all(dir.join(IMAGES_DIR))?;
    fs::create_dir_all(dir.join(CHAPTERS_DIR))?;
    Ok(())
}

/// Reads every `<root>/<folder>/metadata.json`. Unreadable folders become warnings.
/// A folder whose id was already seen (a copied book folder) gets a fresh id,
/// written back, so every id maps to exactly one folder.
pub fn scan(root: &Path) -> AppResult<Scan> {
    let mut dirs = Vec::new();
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        // Hidden folders are restore staging (or the OS's own): never books.
        let hidden = path.file_name().is_some_and(|n| n.to_string_lossy().starts_with('.'));
        if path.is_dir() && !hidden {
            dirs.push(path);
        }
    }
    // Sorted so the original (usually the shorter name) keeps its id.
    dirs.sort();
    let mut books = Vec::new();
    let mut seen = HashSet::new();
    let mut skipped = 0;
    for path in dirs {
        let Ok(mut meta) = read_metadata(&path) else {
            skipped += 1;
            continue;
        };
        if !seen.insert(meta.id.clone()) {
            meta.id = new_id();
            if write_metadata(&path, &meta).is_err() {
                skipped += 1;
                continue;
            }
            seen.insert(meta.id.clone());
        }
        books.push((path, meta));
    }
    let warnings = match skipped {
        0 => vec![],
        1 => vec!["1 pasta ignorada: metadata ausente ou inválido".to_string()],
        n => vec![format!("{n} pastas ignoradas: metadata ausente ou inválido")],
    };
    Ok(Scan { books, warnings })
}

/// Library card of a book and its word total. A v1 book is read through an in-memory
/// migration, so listing never writes; an unreadable tree counts as empty.
pub fn summarize(dir: &Path, meta: &Metadata) -> (BookSummary, usize) {
    let items = peek_tree(dir, meta).unwrap_or_else(|e| {
        eprintln!("could not read the tree of {}: {e}", dir.display());
        Vec::new()
    });
    (BookSummary::from_tree(dir, meta, &items), manuscript::total_words(&items))
}

/// Writes a v2 book: the tree (a Manuscrito holding `chapters`) first, then the metadata with
/// its chapter mirror, opened on chapter `open` (or the first one).
fn write_new_book(dir: &Path, meta: &mut Metadata, chapters: Vec<Node>, open: usize) -> AppResult<()> {
    meta.open = chapters.get(open).or(chapters.first()).map(|c| c.id.clone());
    let mut m = Node::manuscript(new_id());
    m.children = chapters;
    let ws = Workspace { items: vec![m], ..Workspace::default() };
    meta.chapters = manuscript::mirror(&ws.items);
    write_workspace(dir, &ws)?;
    write_metadata(dir, meta)
}

/// Creates the folder tree, a Manuscrito with one empty chapter, and the metadata.
pub fn create_book(root: &Path, title: &str) -> AppResult<(PathBuf, Metadata)> {
    let dir = unique_dir(root, &slugify(title));
    init_book_dirs(&dir)?;
    let chapter = new_chapter(&dir, "", &Doc::default())?;
    let mut meta = Metadata::new(new_id(), title, vec![]);
    write_new_book(&dir, &mut meta, vec![chapter], 0)?;
    Ok((dir, meta))
}

/// Removes the whole book folder. Permanent.
pub fn delete_book(dir: &Path) -> AppResult<()> {
    fs::remove_dir_all(dir)?;
    Ok(())
}

/// Writes the sample books into `root`.
pub fn write_samples(root: &Path) -> AppResult<()> {
    for sample in sample_books() {
        let dir = unique_dir(root, &slugify(sample.title));
        init_book_dirs(&dir)?;
        let mut chapters = Vec::new();
        for c in &sample.chapters {
            let mut node = new_chapter(&dir, c.title, &parse(c.body))?;
            node.status = Some(c.status);
            node.notes = c.notes.to_string();
            chapters.push(node);
        }
        let mut meta = Metadata::new(new_id(), sample.title, vec![]);
        meta.updated_at = now_ms().saturating_sub(sample.age_hours * 3_600_000);
        write_new_book(&dir, &mut meta, chapters, sample.cur)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{manuscript::chapters, metadata::ChapterEntry};
    use crate::storage::workspace_io::read_workspace;

    #[test]
    fn listing_a_v1_book_writes_nothing() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("antiga");
        fs::create_dir_all(&dir).unwrap();
        let mut entry = ChapterEntry::new("c1".into());
        entry.words = 42;
        write_metadata(&dir, &Metadata::new("b1".into(), "Antiga", vec![entry])).unwrap();
        let meta = read_metadata(&dir).unwrap();
        let (card, words) = summarize(&dir, &meta);
        assert_eq!((card.chapters, card.words, words), (1, 42, 42));
        assert!(!dir.join("area").exists());
        assert!(!dir.join(crate::storage::paths::BACKUP_META_FILE).exists());
    }

    #[test]
    fn create_then_scan() {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Meu Livro").unwrap();
        assert!(dir.ends_with("meu-livro"));
        assert!(dir.join("imagens").is_dir());
        let items = read_workspace(&dir).unwrap().items;
        assert!(dir.join(chapters(&items)[0].file.as_ref().unwrap()).is_file());
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 1);
        assert!(scan.warnings.is_empty());
    }

    #[test]
    fn new_books_are_born_v2() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Nova").unwrap();
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.version, 2);
        assert_eq!(ws.items.len(), 1);
        let only = chapters(&ws.items);
        assert_eq!(only.len(), 1);
        assert_eq!(meta.open.as_deref(), Some(only[0].id.as_str()));
        // Born with the mirror, for the cloud server and older app versions.
        assert_eq!(read_metadata(&dir).unwrap().chapters, manuscript::mirror(&ws.items));
        assert!(!dir.join(crate::storage::paths::BACKUP_META_FILE).exists());
    }

    #[test]
    fn same_title_twice_gets_two_folders() {
        let root = tempfile::tempdir().unwrap();
        let (a, _) = create_book(root.path(), "X").unwrap();
        let (b, _) = create_book(root.path(), "X").unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn broken_folders_become_warnings() {
        let root = tempfile::tempdir().unwrap();
        create_book(root.path(), "Boa").unwrap();
        fs::create_dir(root.path().join("sem-meta")).unwrap();
        let bad = root.path().join("quebrada");
        fs::create_dir(&bad).unwrap();
        fs::write(bad.join("metadata.json"), "{ nope").unwrap();
        fs::write(root.path().join("solto.txt"), "x").unwrap();
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 1);
        assert_eq!(scan.warnings, vec!["2 pastas ignoradas: metadata ausente ou inválido"]);
    }

    #[test]
    fn single_broken_folder_gets_singular_warning() {
        let root = tempfile::tempdir().unwrap();
        create_book(root.path(), "Boa").unwrap();
        fs::create_dir(root.path().join("sem-meta")).unwrap();
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 1);
        assert_eq!(scan.warnings, vec!["1 pasta ignorada: metadata ausente ou inválido"]);
    }

    fn copy_dir(from: &Path, to: &Path) {
        fs::create_dir_all(to).unwrap();
        for entry in fs::read_dir(from).unwrap() {
            let p = entry.unwrap().path();
            let target = to.join(p.file_name().unwrap());
            if p.is_dir() { copy_dir(&p, &target) } else { fs::copy(&p, &target).map(|_| ()).unwrap() }
        }
    }

    #[test]
    fn copied_folder_becomes_an_independent_book() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Obra").unwrap();
        let copy = root.path().join("obra - copia");
        copy_dir(&dir, &copy);
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 2);
        let original = scan.books.iter().find(|(d, _)| *d == dir).unwrap();
        let copied = scan.books.iter().find(|(d, _)| *d == copy).unwrap();
        assert_eq!(original.1.id, meta.id);
        assert_ne!(copied.1.id, meta.id);
        assert_eq!(read_metadata(&copy).unwrap().id, copied.1.id);
        // A second scan is stable.
        let again = super::scan(root.path()).unwrap();
        let ids: HashSet<_> = again.books.iter().map(|(_, m)| m.id.clone()).collect();
        assert_eq!(ids, HashSet::from([meta.id.clone(), copied.1.id.clone()]));
    }

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

    #[test]
    fn samples_have_word_counts_and_delete_works() {
        let root = tempfile::tempdir().unwrap();
        write_samples(root.path()).unwrap();
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 3);
        assert!(scan.books.iter().all(|(d, _)| manuscript::total_words(&read_workspace(d).unwrap().items) > 0));
        // Each sample opens on its `cur` chapter.
        assert!(scan.books.iter().all(|(d, m)| {
            let items = read_workspace(d).unwrap().items;
            m.open.as_deref().is_some_and(|id| chapters(&items).iter().any(|c| c.id == id))
        }));
        delete_book(&scan.books[0].0).unwrap();
        assert_eq!(super::scan(root.path()).unwrap().books.len(), 2);
    }
}
