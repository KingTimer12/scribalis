use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::Doc,
    metadata::{ChapterEntry, Metadata},
    patches::ChapterPatch,
    views::SearchHit,
};
use crate::storage::{
    chapter_io::{delete_chapter_file, read_chapter, read_chapter_raw, write_chapter},
    metadata_io::write_metadata,
};
use crate::text::{normalize::fold, words::{doc_text, doc_words}};

fn index_of(meta: &Metadata, chapter_id: &str) -> AppResult<usize> {
    meta.chapters
        .iter()
        .position(|c| c.id == chapter_id)
        .ok_or_else(|| AppError::msg("Capítulo não encontrado"))
}

fn touch_and_write(dir: &Path, meta: &mut Metadata) -> AppResult<()> {
    meta.updated_at = now_ms();
    write_metadata(dir, meta)
}

pub fn load(dir: &Path, meta: &Metadata, chapter_id: &str) -> AppResult<Doc> {
    read_chapter(dir, &meta.chapters[index_of(meta, chapter_id)?])
}

/// Writes the chapter file and refreshes its word count.
pub fn save(dir: &Path, meta: &mut Metadata, chapter_id: &str, doc: &Doc) -> AppResult<ChapterEntry> {
    let i = index_of(meta, chapter_id)?;
    write_chapter(dir, &meta.chapters[i], doc)?;
    meta.chapters[i].words = doc_words(doc);
    touch_and_write(dir, meta)?;
    Ok(meta.chapters[i].clone())
}

pub fn update(dir: &Path, meta: &mut Metadata, chapter_id: &str, patch: ChapterPatch) -> AppResult<ChapterEntry> {
    let i = index_of(meta, chapter_id)?;
    let c = &mut meta.chapters[i];
    if let Some(t) = patch.title { c.title = t; }
    if let Some(n) = patch.notes { c.notes = n; }
    if let Some(s) = patch.status { c.status = s; }
    touch_and_write(dir, meta)?;
    Ok(meta.chapters[i].clone())
}

fn insert_entry(dir: &Path, meta: &mut Metadata, at: usize, doc: &Doc) -> AppResult<()> {
    let mut entry = ChapterEntry::new(new_id());
    entry.words = doc_words(doc);
    write_chapter(dir, &entry, doc)?;
    let at = at.min(meta.chapters.len());
    meta.chapters.insert(at, entry);
    meta.cur = at;
    Ok(())
}

/// Empty chapter at `at`; it becomes the current one.
pub fn insert(dir: &Path, meta: &mut Metadata, at: usize) -> AppResult<()> {
    insert_entry(dir, meta, at, &Doc::default())?;
    touch_and_write(dir, meta)
}

/// Enter ×3: `before` stays in the chapter, `after` opens a new one right below.
pub fn split(dir: &Path, meta: &mut Metadata, chapter_id: &str, before: &Doc, after: &Doc) -> AppResult<()> {
    let i = index_of(meta, chapter_id)?;
    write_chapter(dir, &meta.chapters[i], before)?;
    meta.chapters[i].words = doc_words(before);
    insert_entry(dir, meta, i + 1, after)?;
    touch_and_write(dir, meta)
}

/// Moves chapter `from` to `to`, keeping `cur` on the same chapter.
pub fn move_to(dir: &Path, meta: &mut Metadata, from: usize, to: usize) -> AppResult<()> {
    let n = meta.chapters.len();
    if from >= n || to >= n {
        return Err(AppError::msg("Posição inválida"));
    }
    let current_id = meta.chapters.get(meta.cur).map(|c| c.id.clone());
    let entry = meta.chapters.remove(from);
    meta.chapters.insert(to, entry);
    if let Some(id) = current_id {
        meta.cur = index_of(meta, &id)?;
    }
    touch_and_write(dir, meta)
}

pub fn delete(dir: &Path, meta: &mut Metadata, chapter_id: &str) -> AppResult<()> {
    if meta.chapters.len() == 1 {
        return Err(AppError::msg("A obra precisa de pelo menos um capítulo"));
    }
    let i = index_of(meta, chapter_id)?;
    let entry = meta.chapters.remove(i);
    delete_chapter_file(dir, &entry)?;
    meta.cur = meta.cur.min(meta.chapters.len() - 1);
    touch_and_write(dir, meta)
}

/// Accent/case-insensitive search in titles, then bodies, one file at a time.
pub fn search(dir: &Path, meta: &Metadata, query: &str) -> AppResult<Vec<SearchHit>> {
    let q = fold(query.trim());
    if q.is_empty() {
        return Ok(vec![]);
    }
    let mut hits = Vec::new();
    for (index, c) in meta.chapters.iter().enumerate() {
        let number = format!("{:02}", index + 1);
        let found = fold(&c.title).contains(&q)
            || number.starts_with(&q)
            || fold(&doc_text(&read_chapter(dir, c)?)).contains(&q);
        if found {
            hits.push(SearchHit { index, chapter_id: c.id.clone() });
        }
    }
    Ok(hits)
}

/// "Capítulo N — título" plus the raw markdown, for the clipboard.
pub fn markdown(dir: &Path, meta: &Metadata, chapter_id: &str) -> AppResult<String> {
    let i = index_of(meta, chapter_id)?;
    let c = &meta.chapters[i];
    let head = if c.title.is_empty() { format!("Capítulo {}", i + 1) } else { format!("Capítulo {} — {}", i + 1, c.title) };
    Ok(format!("{head}\n\n{}", read_chapter_raw(dir, c)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::ops::library::create_book;
    use crate::storage::metadata_io::read_metadata;

    fn setup() -> (tempfile::TempDir, std::path::PathBuf, Metadata) {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Obra").unwrap();
        (root, dir, meta)
    }

    #[test]
    fn save_updates_words_and_persists() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        save(&dir, &mut meta, &id, &parse("um dois três")).unwrap();
        assert_eq!(read_metadata(&dir).unwrap().chapters[0].words, 3);
        assert_eq!(load(&dir, &meta, &id).unwrap(), parse("um dois três"));
    }

    #[test]
    fn split_moves_after_text_to_new_chapter() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        split(&dir, &mut meta, &id, &parse("antes"), &parse("depois do cursor")).unwrap();
        assert_eq!(meta.chapters.len(), 2);
        assert_eq!(meta.cur, 1);
        assert_eq!(load(&dir, &meta, &id).unwrap(), parse("antes"));
        let new_id = meta.chapters[1].id.clone();
        assert_eq!(load(&dir, &meta, &new_id).unwrap(), parse("depois do cursor"));
        assert_eq!(meta.chapters[1].words, 3);
    }

    #[test]
    fn move_keeps_cur_on_same_chapter() {
        let (_r, dir, mut meta) = setup();
        insert(&dir, &mut meta, 1).unwrap();
        insert(&dir, &mut meta, 2).unwrap();
        let current = meta.chapters[2].id.clone();
        move_to(&dir, &mut meta, 2, 0).unwrap();
        assert_eq!(meta.chapters[meta.cur].id, current);
        assert_eq!(meta.cur, 0);
    }

    #[test]
    fn delete_refuses_last_and_removes_file() {
        let (_r, dir, mut meta) = setup();
        let only = meta.chapters[0].id.clone();
        assert!(delete(&dir, &mut meta, &only).is_err());
        insert(&dir, &mut meta, 1).unwrap();
        let second = meta.chapters[1].clone();
        delete(&dir, &mut meta, &second.id).unwrap();
        assert!(!dir.join(&second.file).exists());
        assert_eq!(meta.cur, 0);
    }

    #[test]
    fn search_ignores_accents_and_matches_numbers() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        save(&dir, &mut meta, &id, &parse("O coração bate")).unwrap();
        insert(&dir, &mut meta, 1).unwrap();
        assert_eq!(search(&dir, &meta, "CORACAO").unwrap().len(), 1);
        assert_eq!(search(&dir, &meta, "02").unwrap()[0].index, 1);
        assert!(search(&dir, &meta, "   ").unwrap().is_empty());
    }

    #[test]
    fn markdown_has_heading() {
        let (_r, dir, mut meta) = setup();
        let id = meta.chapters[0].id.clone();
        update(&dir, &mut meta, &id, ChapterPatch { title: Some("Início".into()), ..Default::default() }).unwrap();
        save(&dir, &mut meta, &id, &parse("Texto")).unwrap();
        assert_eq!(markdown(&dir, &meta, &id).unwrap(), "Capítulo 1 — Início\n\nTexto\n");
    }
}
