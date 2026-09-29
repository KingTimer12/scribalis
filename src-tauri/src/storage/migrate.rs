//! Upgrades a book from tree version 1 (chapters listed in `metadata.json`) to version 2
//! (chapters inside the Manuscrito node of `area/area.json`).

use std::path::Path;

use super::{
    atomic::write_atomic,
    metadata_io::{read_metadata, write_metadata},
    paths::{BACKUP_META_FILE, META_FILE},
    workspace_io::{read_workspace, write_workspace},
};
use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::{
    manuscript,
    metadata::{ChapterEntry, Metadata},
    workspace::{Node, Workspace, WORKSPACE_VERSION},
};

pub const MIGRATION_FAILED: &str = "Não foi possível atualizar esta obra para o novo formato. Nada foi alterado.";

pub fn needs_upgrade(ws: &Workspace) -> bool {
    ws.version < WORKSPACE_VERSION
}

fn chapter_node(c: &ChapterEntry) -> Node {
    let mut n = Node::chapter(c.id.clone(), &c.title, &c.file);
    n.notes = c.notes.clone();
    n.status = Some(c.status);
    n.words = Some(c.words);
    n.extra = c.extra.clone();
    n
}

/// The v2 pair of a v1 book, built in memory: a Manuscrito holding one chapter per legacy
/// entry (same id, title, notes, status, words, file and unknown fields, same order), then
/// the old items unchanged. `cur` becomes `open`; `chapters` becomes the mirror of the new
/// Manuscrito (equal to the old list); no file moves.
pub fn upgrade(meta: &Metadata, ws: &Workspace, manuscript_id: String) -> (Metadata, Workspace) {
    let mut manuscript = Node::manuscript(manuscript_id);
    manuscript.children = meta.chapters.iter().map(chapter_node).collect();
    let mut items = Vec::with_capacity(ws.items.len() + 1);
    items.push(manuscript);
    items.extend(ws.items.iter().cloned());
    let mut out = meta.clone();
    out.open = meta.chapters.get(meta.cur).map(|c| c.id.clone());
    out.chapters = manuscript::mirror(&items);
    out.cur = 0;
    (out, Workspace { version: WORKSPACE_VERSION, items, extra: ws.extra.clone() })
}

/// Copies `metadata.json` aside once, before its first rewrite.
fn keep_original(dir: &Path) -> AppResult<()> {
    let backup = dir.join(BACKUP_META_FILE);
    if backup.exists() {
        return Ok(());
    }
    write_atomic(&backup, &std::fs::read(dir.join(META_FILE))?)?;
    Ok(())
}

fn migrate(dir: &Path, meta: &Metadata, ws: &Workspace) -> AppResult<Metadata> {
    keep_original(dir)?;
    let (new_meta, new_ws) = upgrade(meta, ws, new_id());
    // The tree first: a stop between the two writes leaves the chapters in both files, never in none.
    write_workspace(dir, &new_ws)?;
    write_metadata(dir, &new_meta)?;
    Ok(new_meta)
}

/// Reads a book for editing, migrating it on disk first when its tree is still v1.
pub fn open_book(dir: &Path) -> AppResult<Metadata> {
    let mut meta = read_metadata(dir)?;
    let ws = read_workspace(dir)?;
    if !needs_upgrade(&ws) {
        // A stop between the migration's two writes leaves a v2 tree next to metadata that still
        // has `cur`: the open node is the chapter at that index in the Manuscrito's order.
        // The backup file only exists once a migration started, so it tells this apart from a
        // fresh v2 book that was simply never opened (cur == 0 is a valid index too).
        let interrupted = meta.cur > 0 || dir.join(BACKUP_META_FILE).exists();
        if meta.open.is_none() && interrupted {
            meta.open = manuscript::chapters(&ws.items).get(meta.cur).map(|c| c.id.clone());
            // Nothing to derive and nothing to clear: skip the write on every open.
            if meta.open.is_some() || meta.cur > 0 {
                meta.cur = 0;
                write_metadata(dir, &meta)?;
            }
        }
        return Ok(meta);
    }
    migrate(dir, &meta, &ws).map_err(|e| {
        eprintln!("migration of {} failed: {e}", dir.display());
        AppError::msg(MIGRATION_FAILED)
    })
}

/// The v2 tree of a book without writing anything (the library lists books not opened since the update).
pub fn peek_tree(dir: &Path, meta: &Metadata) -> AppResult<Vec<Node>> {
    let ws = read_workspace(dir)?;
    if !needs_upgrade(&ws) {
        return Ok(ws.items);
    }
    Ok(upgrade(meta, &ws, String::new()).1.items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::metadata::{ChapterEntry, Metadata, Status};
    use crate::model::workspace::{Node, NodeKind, Workspace, LEGACY_WORKSPACE_VERSION};
    use crate::storage::{
        metadata_io::{read_metadata, write_metadata},
        paths::{AREA_DIR, AREA_FILE, BACKUP_META_FILE, META_FILE},
        workspace_io::{read_workspace, write_workspace},
    };
    use serde_json::Value;
    use std::fs;

    fn entry(id: &str, title: &str, status: Status, words: usize) -> ChapterEntry {
        let mut c = ChapterEntry::new(id.into());
        c.title = title.into();
        c.status = status;
        c.words = words;
        c.notes = format!("notas de {title}");
        c
    }

    /// A v1 book as the previous release wrote it: three chapters, `cur` on the second.
    fn v1_meta() -> Metadata {
        let mut first = entry("c1", "Um", Status::Pronto, 10);
        first.extra.insert("cor".into(), Value::from("azul"));
        let mut meta = Metadata::new("b1".into(), "Obra", vec![
            first,
            entry("c2", "Dois", Status::Revisao, 20),
            entry("c3", "Três", Status::Rascunho, 30),
        ]);
        meta.cur = 1;
        meta
    }

    fn v1_book(with_area: bool) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        write_metadata(dir.path(), &v1_meta()).unwrap();
        if with_area {
            let ws = Workspace {
                version: LEGACY_WORKSPACE_VERSION,
                items: vec![Node::folder("f".into(), "Pesquisa")],
                extra: Default::default(),
            };
            write_workspace(dir.path(), &ws).unwrap();
        }
        dir
    }

    fn raw_meta(dir: &std::path::Path) -> Value {
        serde_json::from_str(&fs::read_to_string(dir.join(META_FILE)).unwrap()).unwrap()
    }

    #[test]
    fn upgrade_keeps_order_ids_notes_status_and_unknown_fields() {
        let ws = Workspace { version: LEGACY_WORKSPACE_VERSION, items: vec![Node::folder("f".into(), "P")], extra: Default::default() };
        let (meta, ws) = upgrade(&v1_meta(), &ws, "m".into());
        assert_eq!(ws.version, 2);
        let m = &ws.items[0];
        assert_eq!((m.id.as_str(), m.kind, m.title.as_str()), ("m", NodeKind::Manuscript, "Manuscrito"));
        let ids: Vec<&str> = m.children.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, vec!["c1", "c2", "c3"]);
        let c1 = &m.children[0];
        assert_eq!(c1.kind, NodeKind::Chapter);
        assert_eq!((c1.title.as_str(), c1.notes.as_str()), ("Um", "notas de Um"));
        assert_eq!((c1.status, c1.words), (Some(Status::Pronto), Some(10)));
        assert_eq!(c1.file.as_deref(), Some("capitulos/c1.md"));
        assert_eq!(c1.extra["cor"], "azul");
        assert_eq!(ws.items[1].id, "f");
        assert_eq!(meta.open.as_deref(), Some("c2"));
        // The mirror equals the old list: same ids, order and fields (unknown ones too).
        assert_eq!(meta.chapters, v1_meta().chapters);
    }

    #[test]
    fn upgrade_tolerates_bad_cur_and_no_chapters() {
        let mut meta = v1_meta();
        meta.cur = 9;
        let (out, _) = upgrade(&meta, &Workspace::default(), "m".into());
        assert_eq!(out.open, None);
        meta.chapters.clear();
        let (_, ws) = upgrade(&meta, &Workspace::default(), "m".into());
        assert_eq!(ws.items.len(), 1);
        assert!(ws.items[0].children.is_empty());
    }

    #[test]
    fn open_book_migrates_once_and_keeps_a_copy() {
        let tmp = v1_book(true);
        let dir = tmp.path();
        let original = fs::read_to_string(dir.join(META_FILE)).unwrap();
        let meta = open_book(dir).unwrap();
        assert_eq!(meta.open.as_deref(), Some("c2"));
        assert_eq!(fs::read_to_string(dir.join(BACKUP_META_FILE)).unwrap(), original);
        let ws = read_workspace(dir).unwrap();
        assert_eq!(ws.version, 2);
        assert_eq!(ws.items[0].children.len(), 3);
        assert_eq!(ws.items[1].id, "f");
        let raw = raw_meta(dir);
        // `chapters` stays, as the mirror of the Manuscrito, for servers and older app versions.
        let mirrored: Vec<&str> = raw["chapters"].as_array().unwrap().iter().map(|c| c["id"].as_str().unwrap()).collect();
        assert_eq!(mirrored, vec!["c1", "c2", "c3"]);
        assert_eq!(raw["chapters"][0]["cor"], "azul");
        assert!(raw.get("cur").is_none());
        assert_eq!(raw["open"], "c2");
        assert!(!dir.join(AREA_DIR).join(format!("{AREA_FILE}.tmp")).exists());

        // A second open changes nothing: same Manuscrito id, backup untouched.
        let manuscript = ws.items[0].id.clone();
        fs::write(dir.join(BACKUP_META_FILE), "marca").unwrap();
        open_book(dir).unwrap();
        assert_eq!(read_workspace(dir).unwrap().items[0].id, manuscript);
        assert_eq!(fs::read_to_string(dir.join(BACKUP_META_FILE)).unwrap(), "marca");
    }

    #[test]
    fn a_book_without_area_folder_migrates() {
        let tmp = v1_book(false);
        open_book(tmp.path()).unwrap();
        let ws = read_workspace(tmp.path()).unwrap();
        assert_eq!(ws.items.len(), 1);
        assert_eq!(ws.items[0].kind, NodeKind::Manuscript);
    }

    #[test]
    fn failed_migration_leaves_the_book_as_it_was() {
        let tmp = v1_book(false);
        let dir = tmp.path();
        // A directory where the tree's temp file goes makes the first write fail.
        fs::create_dir_all(dir.join(AREA_DIR).join(format!("{AREA_FILE}.tmp"))).unwrap();
        assert_eq!(open_book(dir).unwrap_err().0, MIGRATION_FAILED);
        assert_eq!(read_metadata(dir).unwrap().chapters.len(), 3);
        assert!(!dir.join(AREA_DIR).join(AREA_FILE).exists());
    }

    #[test]
    fn a_stop_between_the_two_writes_keeps_the_open_chapter() {
        let dir = v1_book(true);
        // Simulate the crash: the v2 tree is saved, the metadata is still v1 (`cur` = 1).
        let (_, ws) = upgrade(&v1_meta(), &read_workspace(dir.path()).unwrap(), "m".into());
        write_workspace(dir.path(), &ws).unwrap();
        let meta = open_book(dir.path()).unwrap();
        assert_eq!((meta.open.as_deref(), meta.cur), (Some("c2"), 0));
        assert_eq!(read_metadata(dir.path()).unwrap().open.as_deref(), Some("c2"));
    }

    #[test]
    fn a_stop_between_the_two_writes_keeps_the_first_chapter_open_too() {
        let dir = v1_book(true);
        let mut v1 = read_metadata(dir.path()).unwrap();
        v1.cur = 0;
        write_metadata(dir.path(), &v1).unwrap();
        // The migration got as far as its backup and the tree before stopping.
        keep_original(dir.path()).unwrap();
        let (_, ws) = upgrade(&v1, &read_workspace(dir.path()).unwrap(), "m".into());
        write_workspace(dir.path(), &ws).unwrap();
        let meta = open_book(dir.path()).unwrap();
        assert_eq!(meta.open.as_deref(), Some("c1"));
    }

    #[test]
    fn peek_tree_writes_nothing() {
        let tmp = v1_book(false);
        let meta = read_metadata(tmp.path()).unwrap();
        let items = peek_tree(tmp.path(), &meta).unwrap();
        assert_eq!(items[0].children.len(), 3);
        assert!(!tmp.path().join(AREA_DIR).exists());
        assert!(!tmp.path().join(BACKUP_META_FILE).exists());
    }
}
