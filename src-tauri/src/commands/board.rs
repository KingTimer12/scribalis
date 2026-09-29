use tauri::State;

use crate::error::AppResult;
use crate::model::board::Card;
use crate::ops::board as ops;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn board_list(state: State<'_, SharedLibrary>, book_id: String) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::list(dir))
}

#[tauri::command]
pub async fn board_create(state: State<'_, SharedLibrary>, book_id: String, index: usize, title: String) -> AppResult<ops::Created> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::create(dir, index, &title))
}

#[tauri::command]
pub async fn board_rename(state: State<'_, SharedLibrary>, book_id: String, id: String, title: String) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::rename(dir, &id, &title))
}

#[tauri::command]
pub async fn board_load_text(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<String> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::load_text(dir, &id))
}

#[tauri::command]
pub async fn board_save_text(state: State<'_, SharedLibrary>, book_id: String, id: String, text: String) -> AppResult<()> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::save_text(dir, &id, &text))
}

#[tauri::command]
pub async fn board_move(state: State<'_, SharedLibrary>, book_id: String, id: String, index: usize) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::move_to(dir, &id, index))
}

#[tauri::command]
pub async fn board_delete(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::delete(dir, &id))
}

#[tauri::command]
pub async fn board_duplicate(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<ops::Created> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::duplicate(dir, &id))
}
