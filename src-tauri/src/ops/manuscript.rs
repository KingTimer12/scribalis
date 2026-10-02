//! Disk operations of the Manuscrito: word totals, new chapter files, and the conversion of a
//! subtree between chapters (`capitulos/`) and free texts (`area/arquivos/`).

use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::{
    doc::Doc,
    manuscript::{self, in_manuscript},
    metadata::{Metadata, Status},
    workspace::{find, find_mut, insert, locate, move_node, Node, NodeKind},
};
use crate::storage::{
    metadata_io::write_metadata,
    paths::{area_text_rel, chapter_rel, safe_join},
    workspace_io::{read_doc_at, read_workspace, remove_file_at, write_doc_at, write_workspace},
};
use crate::text::words::doc_words;

/// Rewrites `metadata.chapters` as the derived mirror of the Manuscrito when it drifted from the
/// tree, and returns the book's word total. The app never reads the mirror back; the cloud server,
/// custom servers and older app versions do. Reads `area.json` once.
pub fn sync_mirror(dir: &Path, meta: &mut Metadata) -> AppResult<usize> {
    let ws = read_workspace(dir)?;
    let words = manuscript::total_words(&ws.items);
    if manuscript::manuscript(&ws.items).is_none() {
        return Ok(words);
    }
    let mirror = manuscript::mirror(&ws.items);
    if meta.chapters != mirror {
        // Assign only after the write: a failed write must not leave the cache claiming the new
        // mirror (the next sync would then see no drift and never retry).
        let mut next = meta.clone();
        next.chapters = mirror;
        write_metadata(dir, &next)?;
        meta.chapters = next.chapters;
    }
    Ok(words)
}

/// Marks chapters whose file is gone (`missing`), for the webview to warn about. Only for trees
/// sent to the front: the flag is never saved.
pub fn flag_missing(dir: &Path, items: &mut [Node]) {
    for n in items {
        if n.kind == NodeKind::Chapter {
            n.missing = n.file.as_deref().is_none_or(|f| !safe_join(dir, f).is_ok_and(|p| p.is_file()));
        }
        flag_missing(dir, &mut n.children);
    }
}

/// Writes `doc` as a new chapter file; returns its node (draft, words counted), not yet in the tree.
pub fn new_chapter(dir: &Path, title: &str, doc: &Doc) -> AppResult<Node> {
    let id = new_id();
    let rel = chapter_rel(&id);
    write_doc_at(dir, NodeKind::Chapter, &rel, doc)?;
    let mut node = Node::chapter(id, title, &rel);
    node.words = Some(doc_words(doc));
    Ok(node)
}

/// Inserts `node` right after `after_id`, in the same folder (Enter ×3).
pub fn insert_after(items: &mut Vec<Node>, after_id: &str, node: Node) -> AppResult<()> {
    let (parent, i) = locate(items, after_id)
        .map(|(p, i)| (p.map(str::to_string), i))
        .ok_or_else(|| AppError::msg("Capítulo não encontrado"))?;
    insert(items, parent.as_deref(), i + 1, node)
}

/// Turns every text of the subtree into a chapter (`into`), or every chapter into a text,
/// writing each new file. The old files are collected, to be deleted once the tree is saved.
fn convert(dir: &Path, node: &mut Node, into: bool, old: &mut Vec<(NodeKind, String)>) -> AppResult<()> {
    let from = if into { NodeKind::Text } else { NodeKind::Chapter };
    if node.kind == from {
        if let Some(file) = node.file.clone() {
            let doc = read_doc_at(dir, from, &file)?;
            let (kind, rel) = if into {
                (NodeKind::Chapter, chapter_rel(&node.id))
            } else {
                (NodeKind::Text, area_text_rel(&node.id))
            };
            write_doc_at(dir, kind, &rel, &doc)?;
            old.push((from, file));
            node.kind = kind;
            node.file = Some(rel);
            (node.status, node.words) = if into { (Some(Status::Rascunho), Some(doc_words(&doc))) } else { (None, None) };
        }
    }
    for child in &mut node.children {
        convert(dir, child, into, old)?;
    }
    Ok(())
}

/// Moves `id` under `parent` at `index` under the Manuscrito rules, converting the subtree
/// when it crosses the Manuscrito's edge. Order: new files, tree, then old files — a failure
/// midway duplicates a text, never loses it. The id never changes.
pub fn move_converting(dir: &Path, id: &str, parent: Option<&str>, index: usize) -> AppResult<Vec<Node>> {
    let mut ws = read_workspace(dir)?;
    manuscript::check_move(&ws.items, id, parent)?;
    let was_inside = in_manuscript(&ws.items, id);
    let lands_inside = parent.is_some_and(|p| in_manuscript(&ws.items, p));
    let mut items = ws.items.clone();
    move_node(&mut items, id, parent, index)?;
    let mut old = Vec::new();
    if was_inside != lands_inside {
        let node = find_mut(&mut items, id).expect("the node was just moved");
        convert(dir, node, lands_inside, &mut old)?;
    }
    ws.items = items;
    write_workspace(dir, &ws)?;
    for (kind, rel) in &old {
        if let Err(e) = remove_file_at(dir, *kind, rel) {
            eprintln!("could not remove converted file {rel}: {e}");
        }
    }
    debug_assert!(find(&ws.items, id).is_some());
    Ok(ws.items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::manuscript::{chapters, manuscript, LAST_CHAPTER};
    use crate::model::metadata::Status;
    use crate::ops::{library::create_book, workspace};
    use crate::storage::{migrate::open_book, paths::AREA_DIR, workspace_io::read_workspace};
    use std::fs;
    use std::path::PathBuf;

    /// A v2 book with its single empty chapter.
    fn book() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Obra").unwrap();
        open_book(&dir).unwrap();
        (root, dir)
    }

    #[test]
    fn a_failed_mirror_write_leaves_the_cached_mirror_untouched() {
        let (_root, dir) = book();
        let mut meta = open_book(&dir).unwrap();
        meta.chapters.clear();
        // A directory where the file should be makes the atomic rename fail.
        fs::remove_file(dir.join(crate::storage::paths::META_FILE)).unwrap();
        fs::create_dir(dir.join(crate::storage::paths::META_FILE)).unwrap();
        assert!(sync_mirror(&dir, &mut meta).is_err());
        assert!(meta.chapters.is_empty());
    }

    fn manuscript_id(dir: &Path) -> String {
        manuscript(&read_workspace(dir).unwrap().items).unwrap().id.clone()
    }

    /// Adds a second chapter with `text` at the end of the Manuscrito.
    fn add_chapter(dir: &Path, text: &str) -> String {
        let node = new_chapter(dir, "Dois", &parse(text)).unwrap();
        let id = node.id.clone();
        let mut ws = read_workspace(dir).unwrap();
        let m = ws.items[0].id.clone();
        insert(&mut ws.items, Some(&m), usize::MAX, node).unwrap();
        write_workspace(dir, &ws).unwrap();
        id
    }

    #[test]
    fn a_text_moved_in_becomes_a_chapter_with_the_same_id() {
        let (_r, dir) = book();
        let t = workspace::create(&dir, None, 1, NodeKind::Text, "Prólogo").unwrap().id;
        workspace::set_notes(&dir, &t, "cena solta").unwrap();
        workspace::save_doc(&dir, &t, &parse("um dois três")).unwrap();
        let items = move_converting(&dir, &t, Some(&manuscript_id(&dir)), 0).unwrap();
        let node = find(&items, &t).unwrap();
        assert_eq!(node.kind, NodeKind::Chapter);
        assert_eq!(node.file.as_deref(), Some(format!("capitulos/{t}.md").as_str()));
        assert_eq!((node.status, node.words, node.notes.as_str()), (Some(Status::Rascunho), Some(3), "cena solta"));
        assert_eq!(read_doc_at(&dir, NodeKind::Chapter, node.file.as_ref().unwrap()).unwrap(), parse("um dois três"));
        assert!(!dir.join(AREA_DIR).join(format!("{t}.md")).exists());
        assert_eq!(chapters(&items)[0].id, t);
        assert_eq!(read_workspace(&dir).unwrap().items, items);
    }

    #[test]
    fn a_chapter_moved_out_becomes_a_text() {
        let (_r, dir) = book();
        let c = add_chapter(&dir, "a b");
        let items = move_converting(&dir, &c, None, 1).unwrap();
        let node = find(&items, &c).unwrap();
        assert_eq!((node.kind, node.status, node.words), (NodeKind::Text, None, None));
        assert_eq!(node.file.as_deref(), Some(format!("arquivos/{c}.md").as_str()));
        assert_eq!(workspace::load_doc(&dir, &c).unwrap(), parse("a b"));
        assert!(!dir.join(format!("capitulos/{c}.md")).exists());
        assert_eq!(items[1].id, c);
    }

    #[test]
    fn missing_chapter_file_converts_to_empty_text() {
        let (_r, dir) = book();
        let c = add_chapter(&dir, "x");
        fs::remove_file(dir.join(format!("capitulos/{c}.md"))).unwrap();
        move_converting(&dir, &c, None, 1).unwrap();
        assert_eq!(workspace::load_doc(&dir, &c).unwrap(), Doc::default());
    }

    #[test]
    fn refused_move_leaves_disk_untouched() {
        let (_r, dir) = book();
        let area_file = dir.join(AREA_DIR).join("area.json");
        let before = fs::read_to_string(&area_file).unwrap();
        let only = chapters(&read_workspace(&dir).unwrap().items)[0].id.clone();
        assert_eq!(move_converting(&dir, &only, None, 1).unwrap_err().0, LAST_CHAPTER);
        let t = workspace::create(&dir, None, 1, NodeKind::Text, "Ana").unwrap().id;
        let before_text = fs::read_to_string(&area_file).unwrap();
        let m = manuscript(&read_workspace(&dir).unwrap().items).unwrap().id.clone();
        assert_eq!(move_converting(&dir, &m, Some(&t), 0).unwrap_err().0, "O Manuscrito só fica na raiz ou dentro de pastas");
        assert_eq!(fs::read_to_string(&area_file).unwrap(), before_text);
        assert_ne!(before, before_text);
    }

    #[test]
    fn a_folder_converts_its_whole_subtree() {
        let (_r, dir) = book();
        let f = workspace::create(&dir, None, 1, NodeKind::Folder, "Parte 2").unwrap().id;
        let t = workspace::create(&dir, Some(&f), 0, NodeKind::Text, "Cena").unwrap().id;
        let items = move_converting(&dir, &f, Some(&manuscript_id(&dir)), 1).unwrap();
        assert_eq!(find(&items, &f).unwrap().kind, NodeKind::Folder);
        assert_eq!(find(&items, &t).unwrap().kind, NodeKind::Chapter);
        assert_eq!(chapters(&items).len(), 2);
    }

    #[test]
    fn plain_moves_stay_as_they_are() {
        let (_r, dir) = book();
        let a = workspace::create(&dir, None, 1, NodeKind::Folder, "A").unwrap().id;
        let t = workspace::create(&dir, None, 2, NodeKind::Text, "T").unwrap().id;
        let items = move_converting(&dir, &t, Some(&a), 0).unwrap();
        assert_eq!(find(&items, &t).unwrap().kind, NodeKind::Text);
        assert_eq!(find(&items, &a).unwrap().children[0].id, t);
    }

    #[test]
    fn words_and_insert_after() {
        let (_r, dir) = book();
        let first = chapters(&read_workspace(&dir).unwrap().items)[0].id.clone();
        add_chapter(&dir, "um dois");
        assert_eq!(manuscript::total_words(&read_workspace(&dir).unwrap().items), 2);
        let mut items = read_workspace(&dir).unwrap().items;
        let n = new_chapter(&dir, "", &parse("três")).unwrap();
        let id = n.id.clone();
        insert_after(&mut items, &first, n).unwrap();
        let order: Vec<&str> = chapters(&items).iter().map(|c| c.id.as_str()).collect();
        assert_eq!(order[0], first);
        assert_eq!(order[1], id);
        assert!(insert_after(&mut items, "zz", Node::folder("x".into(), "x")).is_err());
    }
}
