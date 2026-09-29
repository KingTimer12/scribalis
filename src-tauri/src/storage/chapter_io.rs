use std::{fs, io::ErrorKind, path::Path};

use super::{atomic::write_atomic, paths::safe_join};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::doc::Doc;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};

    #[test]
    fn missing_file_reads_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_at(dir.path(), "capitulos/c1.md").unwrap(), Doc::default());
    }

    #[test]
    fn write_read_delete() {
        let dir = tempfile::tempdir().unwrap();
        let doc = Doc::new(vec![Block::paragraph(vec![Inline::text("Oi")])]);
        write_at(dir.path(), "capitulos/c1.md", &doc).unwrap();
        assert_eq!(read_at(dir.path(), "capitulos/c1.md").unwrap(), doc);
        delete_at(dir.path(), "capitulos/c1.md").unwrap();
        delete_at(dir.path(), "capitulos/c1.md").unwrap();
        assert!(!dir.path().join("capitulos/c1.md").exists());
    }

    #[test]
    fn refuses_escaping_file_path() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_at(dir.path(), "../fora.md").is_err());
    }
}
