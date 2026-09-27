use std::{fs, io::ErrorKind, path::Path};

use super::{atomic::write_atomic, paths::safe_join};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, metadata::ChapterEntry};

/// Raw markdown; a missing file reads as empty.
pub fn read_chapter_raw(dir: &Path, entry: &ChapterEntry) -> AppResult<String> {
    match fs::read_to_string(safe_join(dir, &entry.file)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

pub fn read_chapter(dir: &Path, entry: &ChapterEntry) -> AppResult<Doc> {
    Ok(parse(&read_chapter_raw(dir, entry)?))
}

pub fn write_chapter(dir: &Path, entry: &ChapterEntry, doc: &Doc) -> AppResult<()> {
    let path = safe_join(dir, &entry.file)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(&path, serialize(doc).as_bytes())?;
    Ok(())
}

pub fn delete_chapter_file(dir: &Path, entry: &ChapterEntry) -> AppResult<()> {
    match fs::remove_file(safe_join(dir, &entry.file)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
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
