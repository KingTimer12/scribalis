//! Operations on a book's workspace tree: create, rename, move, delete,
//! text documents, file imports, promoting a text to a chapter and back.
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::Doc,
    metadata::{ChapterEntry, Metadata},
    workspace::{find, find_mut, insert, move_node, remove, subtree_files, Node, NodeKind},
};
use crate::ops::chapter;
use crate::storage::{
    chapter_io::{read_chapter, write_chapter},
    metadata_io::write_metadata,
    workspace_io::{area_path, copy_into_area, read_node_doc, read_workspace, remove_file_at, write_node_doc, write_workspace},
};
use crate::text::words::doc_words;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub id: String,
    pub items: Vec<Node>,
}

fn not_found() -> AppError {
    AppError::msg("Item não encontrado")
}

/// Loads the tree, applies `f`, saves it and returns the new items.
fn edit(dir: &Path, f: impl FnOnce(&mut Vec<Node>) -> AppResult<()>) -> AppResult<Vec<Node>> {
    let mut ws = read_workspace(dir)?;
    f(&mut ws.items)?;
    write_workspace(dir, &ws)?;
    Ok(ws.items)
}

/// Discards files the tree no longer references; the tree is already saved.
fn discard(dir: &Path, files: &[(NodeKind, String)]) {
    for (kind, rel) in files {
        if let Err(e) = remove_file_at(dir, *kind, rel) {
            eprintln!("could not remove workspace file {rel}: {e}");
        }
    }
}

fn text_file(dir: &Path, id: &str) -> AppResult<String> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?;
    match (node.kind, &node.file) {
        (NodeKind::Text, Some(f)) => Ok(f.clone()),
        _ => Err(AppError::msg("Este item não é um texto")),
    }
}

pub fn tree(dir: &Path) -> AppResult<Vec<Node>> {
    Ok(read_workspace(dir)?.items)
}

/// New folder or empty text under `parent` (None = root).
pub fn create(dir: &Path, parent: Option<&str>, index: usize, kind: NodeKind, title: &str) -> AppResult<Created> {
    let id = new_id();
    let node = match kind {
        NodeKind::Folder => Node::folder(id.clone(), title),
        NodeKind::Text => {
            let file = format!("{id}.md");
            write_node_doc(dir, &file, &Doc::default())?;
            Node::leaf(id.clone(), NodeKind::Text, title, &file)
        }
        _ => return Err(AppError::msg("Use \"Adicionar arquivos\" para imagens e anexos")),
    };
    let items = edit(dir, |items| insert(items, parent, index, node))?;
    Ok(Created { id, items })
}

pub fn rename(dir: &Path, id: &str, title: &str) -> AppResult<Vec<Node>> {
    edit(dir, |items| {
        find_mut(items, id).ok_or_else(not_found)?.title = title.to_string();
        Ok(())
    })
}

pub fn set_notes(dir: &Path, id: &str, notes: &str) -> AppResult<Vec<Node>> {
    edit(dir, |items| {
        find_mut(items, id).ok_or_else(not_found)?.notes = notes.to_string();
        Ok(())
    })
}

pub fn move_to(dir: &Path, id: &str, parent: Option<&str>, index: usize) -> AppResult<Vec<Node>> {
    edit(dir, |items| move_node(items, id, parent, index))
}

/// Removes the node and its subtree; files go only after the tree is saved.
pub fn delete(dir: &Path, id: &str) -> AppResult<Vec<Node>> {
    let mut files = Vec::new();
    let items = edit(dir, |items| {
        let node = remove(items, id).ok_or_else(not_found)?;
        files = subtree_files(&node);
        Ok(())
    })?;
    discard(dir, &files);
    Ok(items)
}

pub fn load_doc(dir: &Path, id: &str) -> AppResult<Doc> {
    read_node_doc(dir, &text_file(dir, id)?)
}

pub fn save_doc(dir: &Path, id: &str, doc: &Doc) -> AppResult<()> {
    write_node_doc(dir, &text_file(dir, id)?, doc)
}

/// Copies files chosen on disk into the workspace, appended under `parent`.
pub fn import_files(dir: &Path, parent: Option<&str>, paths: &[PathBuf]) -> AppResult<Vec<Node>> {
    let mut nodes = Vec::new();
    for src in paths {
        let id = new_id();
        let (rel, kind) = copy_into_area(dir, src, &id)?;
        let title = src.file_stem().and_then(|s| s.to_str()).unwrap_or("Arquivo");
        nodes.push(Node::leaf(id, kind, title, &rel));
    }
    edit(dir, |items| {
        for node in nodes {
            insert(items, parent, usize::MAX, node)?;
        }
        Ok(())
    })
}

/// Absolute path of an image/attachment node (to open it in the default app).
pub fn file_path(dir: &Path, id: &str) -> AppResult<PathBuf> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?;
    area_path(dir, node.file.as_deref().ok_or_else(not_found)?)
}

/// Turns a text into the last chapter. Order: chapter file, metadata, tree,
/// and only then the old file — a failure midway duplicates, never loses, the text.
pub fn to_chapter(dir: &Path, meta: &mut Metadata, id: &str) -> AppResult<Vec<Node>> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?.clone();
    let file = match (node.kind, &node.file) {
        (NodeKind::Text, Some(f)) => f.clone(),
        _ => return Err(AppError::msg("Só textos podem virar capítulos")),
    };
    let doc = read_node_doc(dir, &file)?;
    let mut entry = ChapterEntry::new(new_id());
    entry.title = node.title.clone();
    entry.notes = node.notes.clone();
    entry.words = doc_words(&doc);
    write_chapter(dir, &entry, &doc)?;
    meta.chapters.push(entry);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    let items = edit(dir, |items| remove(items, id).map(|_| ()).ok_or_else(not_found))?;
    discard(dir, &[(NodeKind::Text, file)]);
    Ok(items)
}

/// Turns a chapter into a text at the end of the workspace root. Order: text file,
/// tree, and only then the chapter (metadata, then its file) — a failure midway
/// duplicates, never loses, the text. Resolves to the new node's id and the tree.
pub fn from_chapter(dir: &Path, meta: &mut Metadata, chapter_id: &str) -> AppResult<Created> {
    if meta.chapters.len() == 1 {
        return Err(AppError::msg("A obra precisa de pelo menos um capítulo"));
    }
    let entry = meta.chapters.iter().find(|c| c.id == chapter_id).ok_or_else(|| AppError::msg("Capítulo não encontrado"))?.clone();
    let doc = read_chapter(dir, &entry)?;
    let id = new_id();
    let file = format!("{id}.md");
    write_node_doc(dir, &file, &doc)?;
    let title = if entry.title.trim().is_empty() { "Sem título" } else { entry.title.trim() };
    let mut node = Node::leaf(id.clone(), NodeKind::Text, title, &file);
    node.notes = entry.notes.clone();
    let items = edit(dir, |items| {
        let end = items.len();
        insert(items, None, end, node)
    })?;
    chapter::delete(dir, meta, chapter_id)?;
    Ok(Created { id, items })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::ops::library::create_book;
    use crate::storage::paths::AREA_DIR;

    fn book() -> (tempfile::TempDir, std::path::PathBuf, Metadata) {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Obra").unwrap();
        (root, dir, meta)
    }

    #[test]
    fn empty_book_has_empty_tree_and_no_area_folder() {
        let (_r, dir, _m) = book();
        assert!(tree(&dir).unwrap().is_empty());
        assert!(!dir.join(AREA_DIR).exists());
    }

    #[test]
    fn create_text_writes_file_and_saves_tree() {
        let (_r, dir, _m) = book();
        let folder = create(&dir, None, 0, NodeKind::Folder, "Pesquisa").unwrap();
        let text = create(&dir, Some(&folder.id), 0, NodeKind::Text, "Ana").unwrap();
        let node = find(&text.items, &text.id).unwrap();
        assert_eq!(node.file.as_deref(), Some(format!("{}.md", text.id).as_str()));
        assert!(dir.join(AREA_DIR).join(node.file.as_ref().unwrap()).exists());
        assert_eq!(tree(&dir).unwrap(), text.items);
        assert!(create(&dir, None, 0, NodeKind::Image, "x").is_err());
    }

    #[test]
    fn save_and_load_text_roundtrip() {
        let (_r, dir, _m) = book();
        let c = create(&dir, None, 0, NodeKind::Text, "Ana").unwrap();
        let doc = parse("Ela tinha **olhos** cinzentos.");
        save_doc(&dir, &c.id, &doc).unwrap();
        assert_eq!(load_doc(&dir, &c.id).unwrap(), doc);
        let f = create(&dir, None, 0, NodeKind::Folder, "P").unwrap();
        assert!(load_doc(&dir, &f.id).is_err());
    }

    #[test]
    fn delete_folder_removes_subtree_files_after_saving_tree() {
        let (_r, dir, _m) = book();
        let f = create(&dir, None, 0, NodeKind::Folder, "P").unwrap();
        let t = create(&dir, Some(&f.id), 0, NodeKind::Text, "Ana").unwrap();
        let file = dir.join(AREA_DIR).join(format!("{}.md", t.id));
        assert!(file.exists());
        let items = delete(&dir, &f.id).unwrap();
        assert!(items.is_empty());
        assert!(tree(&dir).unwrap().is_empty());
        assert!(!file.exists());
    }

    #[test]
    fn import_files_copies_and_detects_kind() {
        let (root, dir, _m) = book();
        let png = root.path().join("mapa.png");
        std::fs::write(&png, b"not really a png").unwrap();
        let pdf = root.path().join("Artigo.PDF");
        std::fs::write(&pdf, b"%PDF").unwrap();
        let items = import_files(&dir, None, &[png, pdf]).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!((items[0].kind, items[0].title.as_str()), (NodeKind::Image, "mapa"));
        assert_eq!((items[1].kind, items[1].title.as_str()), (NodeKind::File, "Artigo"));
        assert!(items[1].file.as_ref().unwrap().ends_with(".pdf"));
        assert!(dir.join(AREA_DIR).join(items[1].file.as_ref().unwrap()).exists());
    }

    #[test]
    fn to_chapter_moves_text_to_the_end_of_the_chapters() {
        let (_r, dir, mut meta) = book();
        let c = create(&dir, None, 0, NodeKind::Text, "Prólogo").unwrap();
        set_notes(&dir, &c.id, "cena solta").unwrap();
        save_doc(&dir, &c.id, &parse("um dois três")).unwrap();
        let items = to_chapter(&dir, &mut meta, &c.id).unwrap();
        assert!(items.is_empty());
        let last = meta.chapters.last().unwrap();
        assert_eq!((last.title.as_str(), last.notes.as_str(), last.words), ("Prólogo", "cena solta", 3));
        assert_eq!(crate::storage::chapter_io::read_chapter(&dir, last).unwrap(), parse("um dois três"));
        assert!(!dir.join(AREA_DIR).join(format!("{}.md", c.id)).exists());
        let f = create(&dir, None, 0, NodeKind::Folder, "P").unwrap();
        assert!(to_chapter(&dir, &mut meta, &f.id).is_err());
    }

    #[test]
    fn from_chapter_moves_text_notes_and_title_to_the_workspace() {
        let (_r, dir, mut meta) = book();
        crate::ops::chapter::insert(&dir, &mut meta, 1).unwrap();
        let ch = meta.chapters[0].id.clone();
        crate::ops::chapter::save(&dir, &mut meta, &ch, &parse("texto errado")).unwrap();
        crate::ops::chapter::update(&dir, &mut meta, &ch, crate::model::patches::ChapterPatch {
            title: Some("Capítulo importado".into()),
            notes: Some("nota".into()),
            ..Default::default()
        }).unwrap();
        let file = meta.chapters[0].file.clone();
        let other = meta.chapters[1].id.clone();
        let created = from_chapter(&dir, &mut meta, &ch).unwrap();
        assert_eq!(meta.chapters.len(), 1);
        assert_eq!(meta.chapters[meta.cur].id, other);
        assert!(!dir.join(&file).exists());
        let node = created.items.last().unwrap();
        assert_eq!(node.id, created.id);
        assert_eq!((node.kind, node.title.as_str(), node.notes.as_str()), (NodeKind::Text, "Capítulo importado", "nota"));
        assert_eq!(load_doc(&dir, &created.id).unwrap(), parse("texto errado"));
        // the last chapter stays
        assert!(from_chapter(&dir, &mut meta, &other).is_err());
        assert_eq!(meta.chapters.len(), 1);
    }

    #[test]
    fn rename_move_and_missing_ids() {
        let (_r, dir, _m) = book();
        let a = create(&dir, None, 0, NodeKind::Folder, "A").unwrap();
        let b = create(&dir, None, 1, NodeKind::Text, "B").unwrap();
        let items = rename(&dir, &b.id, "Bê").unwrap();
        assert_eq!(find(&items, &b.id).unwrap().title, "Bê");
        let items = move_to(&dir, &b.id, Some(&a.id), 0).unwrap();
        assert_eq!(items[0].children[0].id, b.id);
        assert_eq!(rename(&dir, "zz", "x").unwrap_err().0, "Item não encontrado");
    }
}
