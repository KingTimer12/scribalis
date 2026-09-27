use tauri::State;

use crate::error::AppResult;
use crate::model::{doc::Doc, patches::ChapterPatch, views::{BookMeta, ChapterMeta, SearchHit}};
use crate::ops::chapter;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn chapter_load(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<Doc> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::load(dir, meta, &chapter_id))
}

#[tauri::command]
pub async fn chapter_save(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String, doc: Doc) -> AppResult<ChapterMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::save(dir, meta, &chapter_id, &doc).map(|c| ChapterMeta::from(&c)))
}

#[tauri::command]
pub async fn chapter_update(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    patch: ChapterPatch,
) -> AppResult<ChapterMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::update(dir, meta, &chapter_id, patch).map(|c| ChapterMeta::from(&c)))
}

#[tauri::command]
pub async fn chapter_insert(state: State<'_, SharedLibrary>, book_id: String, at: usize) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::insert(dir, meta, at)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_split(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    before: Doc,
    after: Doc,
) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::split(dir, meta, &chapter_id, &before, &after)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_move(state: State<'_, SharedLibrary>, book_id: String, from: usize, to: usize) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::move_to(dir, meta, from, to)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_delete(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&book_id, |dir, meta| {
        chapter::delete(dir, meta, &chapter_id)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn chapter_search(state: State<'_, SharedLibrary>, book_id: String, q: String) -> AppResult<Vec<SearchHit>> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::search(dir, meta, &q))
}

#[tauri::command]
pub async fn chapter_markdown(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<String> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::markdown(dir, meta, &chapter_id))
}
