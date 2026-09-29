use std::{fs, io::ErrorKind, path::Path};

use super::{atomic::write_atomic, paths::safe_join};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, metadata::ChapterEntry};

/// Raw markdown of a book-relative file; a missing file reads as empty.
pub fn read_raw_at(dir: &Path, rel: &str) -> AppResult<String> {
    match fs::read_to_string(safe_join(dir, rel)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

pub fn read_at(dir: &Path, rel: &str) -> AppResult<Doc> {
    Ok(parse(&read_raw_at(dir, rel)?))
}

pub fn write_at(dir: &Path, rel: &str, doc: &Doc) -> AppResult<()> {
    let path = safe_join(dir, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(&path, serialize(doc).as_bytes())?;
    Ok(())
}

pub fn delete_at(dir: &Path, rel: &str) -> AppResult<()> {
    match fs::remove_file(safe_join(dir, rel)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

// Legacy entry-based wrappers, removed once the Scrivener import stops using `ChapterEntry` (Task 5).

pub fn read_chapter_raw(dir: &Path, entry: &ChapterEntry) -> AppResult<String> {
    read_raw_at(dir, &entry.file)
}

pub fn read_chapter(dir: &Path, entry: &ChapterEntry) -> AppResult<Doc> {
    read_at(dir, &entry.file)
}

pub fn write_chapter(dir: &Path, entry: &ChapterEntry, doc: &Doc) -> AppResult<()> {
    write_at(dir, &entry.file, doc)
}

pub fn delete_chapter_file(dir: &Path, entry: &ChapterEntry) -> AppResult<()> {
    delete_at(dir, &entry.file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};

    #[test]
    fn missing_file_reads_empty() {
        let dir = tempfile::tempdir().unwrap();
        let entry = ChapterEntry::new("c1".into());
        assert_eq!(read_chapter(dir.path(), &entry).unwrap(), Doc::default());
    }

    #[test]
    fn write_read_delete() {
        let dir = tempfile::tempdir().unwrap();
        let entry = ChapterEntry::new("c1".into());
        let doc = Doc::new(vec![Block::paragraph(vec![Inline::text("Oi")])]);
        write_chapter(dir.path(), &entry, &doc).unwrap();
        assert_eq!(read_chapter(dir.path(), &entry).unwrap(), doc);
        delete_chapter_file(dir.path(), &entry).unwrap();
        delete_chapter_file(dir.path(), &entry).unwrap();
        assert!(!dir.path().join("capitulos/c1.md").exists());
    }

    #[test]
    fn refuses_escaping_file_path() {
        let dir = tempfile::tempdir().unwrap();
        let mut entry = ChapterEntry::new("c1".into());
        entry.file = "../fora.md".into();
        assert!(read_chapter(dir.path(), &entry).is_err());
    }
}
