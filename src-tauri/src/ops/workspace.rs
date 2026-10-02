//! Operations on a book's tree: create, rename, move (converting across the Manuscrito),
//! delete, text documents and file imports. Chapter text lives in `ops::chapter`.
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::{
    doc::Doc,
    manuscript,
    workspace::{find, find_mut, insert, remove, subtree_files, Node, NodeKind, SYNOPSIS_MAX},
};
use crate::ops::manuscript::{flag_missing, move_converting, new_chapter};
use crate::storage::workspace_io::{
    area_path, copy_into_area, read_node_doc, read_workspace, remove_file_at, write_node_doc, write_workspace,
};

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
    flag_missing(dir, &mut ws.items);
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

fn parent_exists(items: &[Node], parent: Option<&str>) -> AppResult<()> {
    match parent {
        Some(p) if find(items, p).is_none() => Err(not_found()),
        _ => Ok(()),
    }
}

/// The tree for the webview: chapters whose file is gone are flagged `missing`.
pub fn tree(dir: &Path) -> AppResult<Vec<Node>> {
    let mut items = read_workspace(dir)?.items;
    flag_missing(dir, &mut items);
    Ok(items)
}

/// New folder, empty text or empty chapter under `parent` (None = root).
pub fn create(dir: &Path, parent: Option<&str>, index: usize, kind: NodeKind, title: &str) -> AppResult<Created> {
    let mut id = String::new();
    let items = edit(dir, |items| {
        parent_exists(items, parent)?;
        manuscript::check_create(items, kind, parent)?;
        let node = match kind {
            NodeKind::Folder => Node::folder(new_id(), title),
            NodeKind::Text => {
                let nid = new_id();
                let file = format!("{nid}.md");
                write_node_doc(dir, &file, &Doc::default())?;
                Node::leaf(nid, NodeKind::Text, title, &file)
            }
            NodeKind::Chapter => new_chapter(dir, title, &Doc::default())?,
            _ => return Err(AppError::msg("Use \"Adicionar arquivos\" para imagens e anexos")),
        };
        id = node.id.clone();
        insert(items, parent, index, node)
    })?;
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

/// Index card summary of any node, the Manuscrito included, cut to `SYNOPSIS_MAX` characters.
pub fn set_synopsis(dir: &Path, id: &str, synopsis: &str) -> AppResult<Vec<Node>> {
    let synopsis: String = synopsis.chars().take(SYNOPSIS_MAX).collect();
    edit(dir, |items| {
        find_mut(items, id).ok_or_else(not_found)?.synopsis = synopsis;
        Ok(())
    })
}

/// Moves a node; crossing the Manuscrito's edge turns texts into chapters or back.
pub fn move_to(dir: &Path, id: &str, parent: Option<&str>, index: usize) -> AppResult<Vec<Node>> {
    let mut items = move_converting(dir, id, parent, index)?;
    flag_missing(dir, &mut items);
    Ok(items)
}

/// Removes the node and its subtree; files go only after the tree is saved.
pub fn delete(dir: &Path, id: &str) -> AppResult<Vec<Node>> {
    let mut files = Vec::new();
    let items = edit(dir, |items| {
        manuscript::check_delete(items, id)?;
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

/// Copies files chosen on disk into the workspace, appended under `parent` (never the Manuscrito).
pub fn import_files(dir: &Path, parent: Option<&str>, paths: &[PathBuf]) -> AppResult<Vec<Node>> {
    let current = read_workspace(dir)?.items;
    parent_exists(&current, parent)?;
    if parent.is_some_and(|p| manuscript::in_manuscript(&current, p)) {
        return Err(AppError::msg(manuscript::NO_MEDIA));
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::manuscript::{chapters, LAST_CHAPTER, NO_MEDIA};
    use crate::model::metadata::Status;
    use crate::ops::library::create_book;
    use crate::storage::{migrate::open_book, paths::AREA_DIR};

    fn book() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Obra").unwrap();
        open_book(&dir).unwrap();
        (root, dir)
    }

    fn manuscript_id(dir: &Path) -> String {
        tree(dir).unwrap()[0].id.clone()
    }

    #[test]
    fn the_manuscript_comes_first_with_one_chapter() {
        let (_r, dir) = book();
        let items = tree(&dir).unwrap();
        assert_eq!(items[0].kind, NodeKind::Manuscript);
        assert_eq!(chapters(&items).len(), 1);
    }

    #[test]
    fn create_text_writes_file_and_saves_tree() {
        let (_r, dir) = book();
        // Index 0 at the root is the very top, before the Manuscrito.
        let folder = create(&dir, None, 0, NodeKind::Folder, "Pesquisa").unwrap();
        assert_eq!(folder.items[0].id, folder.id);
        let text = create(&dir, Some(&folder.id), 0, NodeKind::Text, "Ana").unwrap();
        let node = find(&text.items, &text.id).unwrap();
        assert_eq!(node.file.as_deref(), Some(format!("{}.md", text.id).as_str()));
        assert!(dir.join(AREA_DIR).join(node.file.as_ref().unwrap()).exists());
        assert_eq!(tree(&dir).unwrap(), text.items);
        assert!(create(&dir, None, 1, NodeKind::Image, "x").is_err());
    }

    #[test]
    fn chapters_are_created_only_inside_the_manuscript() {
        let (_r, dir) = book();
        let m = manuscript_id(&dir);
        let c = create(&dir, Some(&m), 1, NodeKind::Chapter, "Dois").unwrap();
        let node = find(&c.items, &c.id).unwrap();
        assert_eq!((node.kind, node.status, node.words), (NodeKind::Chapter, Some(Status::Rascunho), Some(0)));
        assert!(dir.join(format!("capitulos/{}.md", c.id)).is_file());
        assert_eq!(create(&dir, None, 1, NodeKind::Chapter, "x").unwrap_err().0, "Capítulos ficam dentro do Manuscrito");
        assert_eq!(create(&dir, Some(&m), 0, NodeKind::Text, "x").unwrap_err().0, "Textos livres ficam fora do Manuscrito");
        assert_eq!(create(&dir, Some("zz"), 0, NodeKind::Folder, "x").unwrap_err().0, "Item não encontrado");
    }

    #[test]
    fn save_and_load_text_roundtrip() {
        let (_r, dir) = book();
        let c = create(&dir, None, 1, NodeKind::Text, "Ana").unwrap();
        let doc = parse("Ela tinha **olhos** cinzentos.");
        save_doc(&dir, &c.id, &doc).unwrap();
        assert_eq!(load_doc(&dir, &c.id).unwrap(), doc);
        let f = create(&dir, None, 1, NodeKind::Folder, "P").unwrap();
        assert!(load_doc(&dir, &f.id).is_err());
    }

    #[test]
    fn delete_folder_removes_subtree_files_after_saving_tree() {
        let (_r, dir) = book();
        let f = create(&dir, None, 1, NodeKind::Folder, "P").unwrap();
        let t = create(&dir, Some(&f.id), 0, NodeKind::Text, "Ana").unwrap();
        let file = dir.join(AREA_DIR).join(format!("{}.md", t.id));
        assert!(file.exists());
        let items = delete(&dir, &f.id).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(tree(&dir).unwrap().len(), 1);
        assert!(!file.exists());
    }

    #[test]
    fn deleting_chapters_removes_their_files_but_never_the_last() {
        let (_r, dir) = book();
        let m = manuscript_id(&dir);
        let only = chapters(&tree(&dir).unwrap())[0].id.clone();
        assert_eq!(delete(&dir, &only).unwrap_err().0, LAST_CHAPTER);
        let c = create(&dir, Some(&m), 1, NodeKind::Chapter, "").unwrap().id;
        let file = dir.join(format!("capitulos/{c}.md"));
        assert!(file.exists());
        delete(&dir, &c).unwrap();
        assert!(!file.exists());
        assert_eq!(delete(&dir, &m).unwrap_err().0, "O Manuscrito não pode ser excluído");
        let renamed = rename(&dir, &m, "Livro").unwrap();
        assert_eq!(find(&renamed, &m).unwrap().title, "Livro");
    }

    #[test]
    fn import_files_copies_and_detects_kind() {
        let (root, dir) = book();
        let png = root.path().join("mapa.png");
        std::fs::write(&png, b"not really a png").unwrap();
        let pdf = root.path().join("Artigo.PDF");
        std::fs::write(&pdf, b"%PDF").unwrap();
        assert_eq!(import_files(&dir, Some(&manuscript_id(&dir)), std::slice::from_ref(&png)).unwrap_err().0, NO_MEDIA);
        let items = import_files(&dir, None, &[png, pdf]).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!((items[1].kind, items[1].title.as_str()), (NodeKind::Image, "mapa"));
        assert_eq!((items[2].kind, items[2].title.as_str()), (NodeKind::File, "Artigo"));
        assert!(items[2].file.as_ref().unwrap().ends_with(".pdf"));
        assert!(dir.join(AREA_DIR).join(items[2].file.as_ref().unwrap()).exists());
    }

    #[test]
    fn a_chapter_without_its_file_is_flagged_in_the_tree() {
        let (_r, dir) = book();
        let m = manuscript_id(&dir);
        let c = create(&dir, Some(&m), 1, NodeKind::Chapter, "Dois").unwrap().id;
        assert!(chapters(&tree(&dir).unwrap()).iter().all(|n| !n.missing));
        std::fs::remove_file(dir.join(format!("capitulos/{c}.md"))).unwrap();
        let items = tree(&dir).unwrap();
        assert!(find(&items, &c).unwrap().missing);
        assert_eq!(chapters(&items).iter().filter(|n| n.missing).count(), 1);
        // Every returned tree carries the flag, but it is never written to disk.
        assert!(find(&rename(&dir, &c, "Outro").unwrap(), &c).unwrap().missing);
        let raw = std::fs::read_to_string(dir.join(AREA_DIR).join("area.json")).unwrap();
        assert!(!raw.contains("missing"));
        assert!(find(&crate::storage::workspace_io::read_workspace(&dir).unwrap().items, &c).is_some_and(|n| !n.missing));
    }

    #[test]
    fn moving_into_the_manuscript_converts() {
        let (_r, dir) = book();
        let t = create(&dir, None, 1, NodeKind::Text, "Prólogo").unwrap().id;
        let items = move_to(&dir, &t, Some(&manuscript_id(&dir)), 0).unwrap();
        assert_eq!(find(&items, &t).unwrap().kind, NodeKind::Chapter);
    }

    #[test]
    fn set_synopsis_saves_and_cuts_long_text() {
        let (_r, dir) = book();
        let m = manuscript_id(&dir);
        let items = set_synopsis(&dir, &m, "A história toda").unwrap();
        assert_eq!(find(&items, &m).unwrap().synopsis, "A história toda");
        assert_eq!(find(&tree(&dir).unwrap(), &m).unwrap().synopsis, "A história toda");
        // Multi-byte characters: cut by character, never inside one.
        let long = "é".repeat(SYNOPSIS_MAX + 5);
        let items = set_synopsis(&dir, &m, &long).unwrap();
        assert_eq!(find(&items, &m).unwrap().synopsis.chars().count(), SYNOPSIS_MAX);
        // Clearing it drops the field from disk.
        set_synopsis(&dir, &m, "").unwrap();
        let raw = std::fs::read_to_string(dir.join(AREA_DIR).join("area.json")).unwrap();
        assert!(!raw.contains("synopsis"));
        assert_eq!(set_synopsis(&dir, "zz", "x").unwrap_err().0, "Item não encontrado");
    }

    #[test]
    fn rename_move_and_missing_ids() {
        let (_r, dir) = book();
        let a = create(&dir, None, 1, NodeKind::Folder, "A").unwrap();
        let b = create(&dir, None, 2, NodeKind::Text, "B").unwrap();
        let items = rename(&dir, &b.id, "Bê").unwrap();
        assert_eq!(find(&items, &b.id).unwrap().title, "Bê");
        let items = move_to(&dir, &b.id, Some(&a.id), 0).unwrap();
        assert_eq!(find(&items, &a.id).unwrap().children[0].id, b.id);
        assert_eq!(rename(&dir, "zz", "x").unwrap_err().0, "Item não encontrado");
    }
}
