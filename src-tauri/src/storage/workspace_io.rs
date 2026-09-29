//! Disk I/O for the workspace tree and the files its nodes reference.
use std::{fs, io::ErrorKind, path::{Path, PathBuf}};

use super::{
    atomic::write_atomic,
    chapter_io::{self, delete_at},
    paths::{safe_join, AREA_DIR, AREA_FILE, AREA_FILES_DIR},
};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, workspace::{NodeKind, Workspace, LEGACY_WORKSPACE_VERSION}};

/// Absolute path of a file referenced from `area.json`.
pub fn area_path(book_dir: &Path, rel: &str) -> AppResult<PathBuf> {
    safe_join(&book_dir.join(AREA_DIR), rel)
}

/// The tree; a book without `area/` predates it, so it reads as an empty v1 tree.
pub fn read_workspace(book_dir: &Path) -> AppResult<Workspace> {
    match fs::read_to_string(book_dir.join(AREA_DIR).join(AREA_FILE)) {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Workspace { version: LEGACY_WORKSPACE_VERSION, ..Workspace::default() }),
        Err(e) => Err(e.into()),
    }
}

pub fn write_workspace(book_dir: &Path, ws: &Workspace) -> AppResult<()> {
    let dir = book_dir.join(AREA_DIR);
    fs::create_dir_all(&dir)?;
    write_atomic(&dir.join(AREA_FILE), serde_json::to_string_pretty(ws)?.as_bytes())?;
    Ok(())
}

/// A text node's document; a missing file reads as empty.
pub fn read_node_doc(book_dir: &Path, rel: &str) -> AppResult<Doc> {
    match fs::read_to_string(area_path(book_dir, rel)?) {
        Ok(s) => Ok(parse(&s)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Doc::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_node_doc(book_dir: &Path, rel: &str, doc: &Doc) -> AppResult<()> {
    let path = area_path(book_dir, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(&path, serialize(doc).as_bytes())?;
    Ok(())
}

/// Copies `src` to `area/arquivos/<id>.<ext>`; the kind comes from the extension.
pub fn copy_into_area(book_dir: &Path, src: &Path, id: &str) -> AppResult<(String, NodeKind)> {
    let ext = src.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    let name = if ext.is_empty() { id.to_string() } else { format!("{id}.{ext}") };
    let rel = format!("{AREA_FILES_DIR}/{name}");
    let dest = area_path(book_dir, &rel)?;
    fs::create_dir_all(dest.parent().expect("has a parent"))?;
    fs::copy(src, &dest)?;
    Ok((rel, NodeKind::for_extension(&ext)))
}

/// Removes the file of a node of `kind`; a missing file is fine. Chapters resolve from the
/// book folder, every other kind from `area/`.
pub fn remove_file_at(book_dir: &Path, kind: NodeKind, rel: &str) -> AppResult<()> {
    if kind == NodeKind::Chapter { delete_at(book_dir, rel) } else { delete_at(&book_dir.join(AREA_DIR), rel) }
}

/// The document of a node of `kind`: chapters resolve from the book folder, texts from `area/`.
pub fn read_doc_at(book_dir: &Path, kind: NodeKind, rel: &str) -> AppResult<Doc> {
    if kind == NodeKind::Chapter { chapter_io::read_at(book_dir, rel) } else { read_node_doc(book_dir, rel) }
}

pub fn write_doc_at(book_dir: &Path, kind: NodeKind, rel: &str, doc: &Doc) -> AppResult<()> {
    if kind == NodeKind::Chapter { chapter_io::write_at(book_dir, rel, doc) } else { write_node_doc(book_dir, rel, doc) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};

    #[test]
    fn missing_area_reads_as_empty_v1() {
        let dir = tempfile::tempdir().unwrap();
        let ws = read_workspace(dir.path()).unwrap();
        assert_eq!((ws.version, ws.items.len()), (1, 0));
    }

    #[test]
    fn chapter_files_resolve_from_the_book_and_texts_from_area() {
        let dir = tempfile::tempdir().unwrap();
        let doc = Doc::new(vec![Block::paragraph(vec![Inline::text("Oi")])]);
        write_doc_at(dir.path(), NodeKind::Chapter, "capitulos/c.md", &doc).unwrap();
        write_doc_at(dir.path(), NodeKind::Text, "arquivos/t.md", &doc).unwrap();
        assert!(dir.path().join("capitulos/c.md").is_file());
        assert!(dir.path().join("area/arquivos/t.md").is_file());
        assert_eq!(read_doc_at(dir.path(), NodeKind::Chapter, "capitulos/c.md").unwrap(), doc);
        remove_file_at(dir.path(), NodeKind::Chapter, "capitulos/c.md").unwrap();
        remove_file_at(dir.path(), NodeKind::Text, "arquivos/t.md").unwrap();
        remove_file_at(dir.path(), NodeKind::Text, "arquivos/t.md").unwrap();
        assert!(!dir.path().join("capitulos/c.md").exists());
        assert!(!dir.path().join("area/arquivos/t.md").exists());
    }
}
