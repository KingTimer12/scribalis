use tauri::State;

use crate::error::AppResult;
use crate::model::{doc::Doc, patches::ChapterPatch, views::SearchHit, workspace::Node};
use crate::ops::{chapter, workspace::Created};
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn chapter_load(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<Doc> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::load(dir, &chapter_id))
}

#[tauri::command]
pub async fn chapter_save(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String, doc: Doc) -> AppResult<Node> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::save(dir, meta, &chapter_id, &doc))
}

#[tauri::command]
pub async fn chapter_update(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    patch: ChapterPatch,
) -> AppResult<Node> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::update(dir, meta, &chapter_id, patch))
}

#[tauri::command]
pub async fn chapter_split(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    before: Doc,
    after: Doc,
) -> AppResult<Created> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::split(dir, meta, &chapter_id, &before, &after))
}

/// Previous (`step` -1) or next (`step` 1) chapter in reading order; null past either end.
#[tauri::command]
pub async fn chapter_neighbor(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String, step: i32) -> AppResult<Option<String>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::neighbor(dir, &chapter_id, step))
}

#[tauri::command]
pub async fn chapter_search(state: State<'_, SharedLibrary>, book_id: String, q: String) -> AppResult<Vec<SearchHit>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::search(dir, &q))
}

#[tauri::command]
pub async fn chapter_markdown(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<String> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::markdown(dir, &chapter_id))
}
