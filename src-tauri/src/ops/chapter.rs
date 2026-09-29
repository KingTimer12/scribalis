//! Chapters, found through the Manuscrito: text, title/notes/status, Enter ×3, reading
//! order, search and the "copy to publish" markdown.

use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::ids::now_ms;
use crate::markdown::serialize::serialize_without_attrs;
use crate::model::{
    doc::Doc,
    manuscript,
    metadata::Metadata,
    patches::ChapterPatch,
    views::SearchHit,
    workspace::{find_mut, Node, NodeKind, Workspace},
};
use crate::ops::{manuscript::{flag_missing, insert_after, new_chapter}, workspace::Created};
use crate::storage::{
    chapter_io::{read_at, write_at},
    metadata_io::write_metadata,
    workspace_io::{read_workspace, write_workspace},
};
use crate::text::{normalize::fold, words::{doc_text, doc_words}};

fn missing() -> AppError {
    AppError::msg("Capítulo não encontrado")
}

/// The chapter's book-relative file; any other node is "not found".
fn file_of(ws: &Workspace, id: &str) -> AppResult<String> {
    manuscript::chapter(&ws.items, id).and_then(|c| c.file.clone()).ok_or_else(missing)
}

fn chapter_mut<'a>(ws: &'a mut Workspace, id: &str) -> AppResult<&'a mut Node> {
    find_mut(&mut ws.items, id).filter(|n| n.kind == NodeKind::Chapter).ok_or_else(missing)
}

/// Saves the tree, then marks the book as edited. The chapter mirror in `metadata.chapters`
/// is refreshed from the tree already in hand, so a save reads `area.json` once and writes
/// the metadata once.
fn persist(dir: &Path, meta: &mut Metadata, ws: &Workspace) -> AppResult<()> {
    write_workspace(dir, ws)?;
    meta.chapters = manuscript::mirror(&ws.items);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)
}

pub fn load(dir: &Path, chapter_id: &str) -> AppResult<Doc> {
    read_at(dir, &file_of(&read_workspace(dir)?, chapter_id)?)
}

/// Writes the chapter file and refreshes its word count in the tree.
pub fn save(dir: &Path, meta: &mut Metadata, chapter_id: &str, doc: &Doc) -> AppResult<Node> {
    let mut ws = read_workspace(dir)?;
    write_at(dir, &file_of(&ws, chapter_id)?, doc)?;
    let node = chapter_mut(&mut ws, chapter_id)?;
    node.words = Some(doc_words(doc));
    let out = node.clone();
    persist(dir, meta, &ws)?;
    Ok(out)
}

pub fn update(dir: &Path, meta: &mut Metadata, chapter_id: &str, patch: ChapterPatch) -> AppResult<Node> {
    let mut ws = read_workspace(dir)?;
    let node = chapter_mut(&mut ws, chapter_id)?;
    if let Some(t) = patch.title {
        node.title = t;
    }
    if let Some(n) = patch.notes {
        node.notes = n;
    }
    if let Some(s) = patch.status {
        node.status = Some(s);
    }
    let out = node.clone();
    persist(dir, meta, &ws)?;
    Ok(out)
}

/// Enter ×3: `before` stays in the chapter, `after` opens a new chapter right below it, in
/// the same folder, and becomes the open node. Order: new file, tree, and only then the
/// original is cut — a failure at any step leaves the text duplicated, never lost.
pub fn split(dir: &Path, meta: &mut Metadata, chapter_id: &str, before: &Doc, after: &Doc) -> AppResult<Created> {
    let mut ws = read_workspace(dir)?;
    let file = file_of(&ws, chapter_id)?;
    let node = new_chapter(dir, "", after)?;
    let id = node.id.clone();
    insert_after(&mut ws.items, chapter_id, node)?;
    chapter_mut(&mut ws, chapter_id)?.words = Some(doc_words(before));
    meta.open = Some(id.clone());
    persist(dir, meta, &ws)?;
    write_at(dir, &file, before)?;
    flag_missing(dir, &mut ws.items);
    Ok(Created { id, items: ws.items })
}

/// The chapter `step` places away from `chapter_id` in reading order (None past either end).
pub fn neighbor(dir: &Path, chapter_id: &str, step: i32) -> AppResult<Option<String>> {
    let ws = read_workspace(dir)?;
    manuscript::chapter(&ws.items, chapter_id).ok_or_else(missing)?;
    Ok(manuscript::neighbor(&ws.items, chapter_id, step))
}

/// Accent/case-insensitive search in titles, numbers, then bodies, one file at a time.
pub fn search(dir: &Path, query: &str) -> AppResult<Vec<SearchHit>> {
    let q = fold(query.trim());
    if q.is_empty() {
        return Ok(vec![]);
    }
    let ws = read_workspace(dir)?;
    let mut hits = Vec::new();
    for (index, c) in manuscript::chapters(&ws.items).into_iter().enumerate() {
        let number = format!("{:02}", index + 1);
        let found = fold(&c.title).contains(&q)
            || number.starts_with(&q)
            || match &c.file {
                Some(f) => fold(&doc_text(&read_at(dir, f)?)).contains(&q),
                None => false,
            };
        if found {
            hits.push(SearchHit { index, chapter_id: c.id.clone() });
        }
    }
    Ok(hits)
}

/// "Capítulo N — título" plus the chapter markdown, for the clipboard. N follows the reading
/// order. Attribute lines (`{: …}`) are stripped: they are formatting metadata, not text.
pub fn markdown(dir: &Path, chapter_id: &str) -> AppResult<String> {
    let ws = read_workspace(dir)?;
    let file = file_of(&ws, chapter_id)?;
    let n = manuscript::position(&ws.items, chapter_id).ok_or_else(missing)? + 1;
    let title = manuscript::chapter(&ws.items, chapter_id).map(|c| c.title.clone()).unwrap_or_default();
    let head = if title.is_empty() { format!("Capítulo {n}") } else { format!("Capítulo {n} — {title}") };
    Ok(format!("{head}\n\n{}", serialize_without_attrs(&read_at(dir, &file)?)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::{manuscript::chapters, metadata::Status, workspace::NodeKind};
    use crate::ops::{library::create_book, workspace};
    use crate::storage::migrate::open_book;

    fn setup() -> (tempfile::TempDir, std::path::PathBuf, Metadata) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _) = create_book(root.path(), "Obra").unwrap();
        let meta = open_book(&dir).unwrap();
        (root, dir, meta)
    }

    fn order(dir: &Path) -> Vec<String> {
        chapters(&read_workspace(dir).unwrap().items).iter().map(|c| c.id.clone()).collect()
    }

    fn manuscript_id(dir: &Path) -> String {
        read_workspace(dir).unwrap().items[0].id.clone()
    }

    #[test]
    fn save_updates_words_and_persists() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        let node = save(&dir, &mut meta, &id, &parse("um dois três")).unwrap();
        assert_eq!(node.words, Some(3));
        assert_eq!(chapters(&read_workspace(&dir).unwrap().items)[0].words, Some(3));
        assert_eq!(load(&dir, &id).unwrap(), parse("um dois três"));
    }

    #[test]
    fn split_opens_the_new_chapter_right_below_in_the_same_folder() {
        let (_r, dir, mut meta) = setup();
        let m = manuscript_id(&dir);
        let first = order(&dir)[0].clone();
        let part = workspace::create(&dir, Some(&m), 0, NodeKind::Folder, "Parte 1").unwrap().id;
        workspace::move_to(&dir, &first, Some(&part), 0).unwrap();
        let later = workspace::create(&dir, Some(&m), 1, NodeKind::Chapter, "Depois").unwrap().id;
        let created = split(&dir, &mut meta, &first, &parse("antes"), &parse("depois do cursor")).unwrap();
        assert_eq!(order(&dir), vec![first.clone(), created.id.clone(), later]);
        let folder = crate::model::workspace::find(&created.items, &part).unwrap();
        assert_eq!(folder.children[1].id, created.id);
        assert_eq!(meta.open.as_deref(), Some(created.id.as_str()));
        assert_eq!(load(&dir, &first).unwrap(), parse("antes"));
        assert_eq!(load(&dir, &created.id).unwrap(), parse("depois do cursor"));
        let node = crate::model::workspace::find(&created.items, &created.id).unwrap();
        assert_eq!((node.words, node.status), (Some(3), Some(Status::Rascunho)));
    }

    #[test]
    fn failed_split_duplicates_text_instead_of_losing_it() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        save(&dir, &mut meta, &id, &parse("antes depois")).unwrap();
        // A directory where the original's temp file goes makes its overwrite fail.
        std::fs::create_dir_all(dir.join(format!("capitulos/{id}.md.tmp"))).unwrap();
        assert!(split(&dir, &mut meta, &id, &parse("antes"), &parse("depois")).is_err());
        let ids = order(&dir);
        // The new chapter is already in the tree with the `after` text...
        assert_eq!(ids.len(), 2);
        assert_eq!(load(&dir, &ids[1]).unwrap(), parse("depois"));
        // ...and the original still holds everything.
        assert_eq!(load(&dir, &id).unwrap(), parse("antes depois"));
    }

    #[test]
    fn neighbor_follows_reading_order() {
        let (_r, dir, _meta) = setup();
        let m = manuscript_id(&dir);
        let first = order(&dir)[0].clone();
        let second = workspace::create(&dir, Some(&m), 1, NodeKind::Chapter, "").unwrap().id;
        assert_eq!(neighbor(&dir, &first, 1).unwrap().as_deref(), Some(second.as_str()));
        assert_eq!(neighbor(&dir, &first, -1).unwrap(), None);
        assert_eq!(neighbor(&dir, &second, 1).unwrap(), None);
        assert_eq!(neighbor(&dir, "zz", 1).unwrap_err().0, "Capítulo não encontrado");
    }

    #[test]
    fn search_ignores_accents_and_matches_numbers() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        save(&dir, &mut meta, &id, &parse("O coração bate")).unwrap();
        workspace::create(&dir, Some(&manuscript_id(&dir)), 1, NodeKind::Chapter, "").unwrap();
        assert_eq!(search(&dir, "CORACAO").unwrap().len(), 1);
        assert_eq!(search(&dir, "02").unwrap()[0].index, 1);
        assert!(search(&dir, "   ").unwrap().is_empty());
    }

    #[test]
    fn markdown_has_heading() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        update(&dir, &mut meta, &id, ChapterPatch { title: Some("Início".into()), ..Default::default() }).unwrap();
        save(&dir, &mut meta, &id, &parse("Texto")).unwrap();
        assert_eq!(markdown(&dir, &id).unwrap(), "Capítulo 1 — Início\n\nTexto\n");
    }

    #[test]
    fn markdown_strips_attribute_lines() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        save(&dir, &mut meta, &id, &parse("Título\n{: align=center}\n\nTexto simples")).unwrap();
        assert_eq!(markdown(&dir, &id).unwrap(), "Capítulo 1\n\nTítulo\n\nTexto simples\n");
    }

    #[test]
    fn update_persists_notes_and_status() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        update(&dir, &mut meta, &id, ChapterPatch {
            notes: Some("Minhas notas".into()),
            status: Some(Status::Revisao),
            ..Default::default()
        }).unwrap();
        let c = chapters(&read_workspace(&dir).unwrap().items)[0].clone();
        assert_eq!((c.notes.as_str(), c.status), ("Minhas notas", Some(Status::Revisao)));
    }

    #[test]
    fn saving_refreshes_the_metadata_mirror() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        update(&dir, &mut meta, &id, ChapterPatch { title: Some("Novo".into()), ..Default::default() }).unwrap();
        save(&dir, &mut meta, &id, &parse("um dois")).unwrap();
        let mirror = crate::storage::metadata_io::read_metadata(&dir).unwrap().chapters;
        assert_eq!((mirror[0].title.as_str(), mirror[0].words), ("Novo", 2));
    }

    #[test]
    fn other_nodes_are_not_chapters() {
        let (_r, dir, mut meta) = setup();
        let t = workspace::create(&dir, None, 1, NodeKind::Text, "Ana").unwrap().id;
        assert_eq!(load(&dir, &t).unwrap_err().0, "Capítulo não encontrado");
        assert!(save(&dir, &mut meta, &t, &parse("x")).is_err());
    }
}
