//! Disk I/O for the workspace tree and the files its nodes reference.
use std::{fs, io::ErrorKind, path::{Path, PathBuf}};

use super::{atomic::write_atomic, paths::{safe_join, AREA_DIR, AREA_FILE, AREA_FILES_DIR}};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, workspace::{NodeKind, Workspace}};

/// Absolute path of a file referenced from `area.json`.
pub fn area_path(book_dir: &Path, rel: &str) -> AppResult<PathBuf> {
    safe_join(&book_dir.join(AREA_DIR), rel)
}

/// The workspace tree; a book without `area/` has an empty one.
pub fn read_workspace(book_dir: &Path) -> AppResult<Workspace> {
    match fs::read_to_string(book_dir.join(AREA_DIR).join(AREA_FILE)) {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Workspace::default()),
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

pub fn remove_area_file(book_dir: &Path, rel: &str) -> AppResult<()> {
    match fs::remove_file(area_path(book_dir, rel)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}
