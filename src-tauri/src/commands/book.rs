use std::path::PathBuf;

use tauri::{State, WebviewWindow};

use super::dialog::pick_image;
use crate::error::AppResult;
use crate::model::{patches::{BookPatch, ImageSlot}, views::BookMeta};
use crate::ops::book;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn book_open(state: State<'_, SharedLibrary>, id: String) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&id, |dir, meta| Ok(BookMeta::from_meta(dir, meta)))
}

#[tauri::command]
pub async fn book_update(state: State<'_, SharedLibrary>, id: String, patch: BookPatch) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&id, |dir, meta| {
        book::update(dir, meta, patch)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn book_pick_image(
    window: WebviewWindow,
    state: State<'_, SharedLibrary>,
    id: String,
    slot: ImageSlot,
) -> AppResult<Option<BookMeta>> {
    // The dialog runs before locking so the state is never held while the user browses.
    let Some(src) = pick_image(&window) else { return Ok(None) };
    lock(&state)?.with_book(&id, |dir, meta| {
        book::set_image(dir, meta, slot, &src)?;
        Ok(Some(BookMeta::from_meta(dir, meta)))
    })
}

#[tauri::command]
pub async fn book_clear_image(state: State<'_, SharedLibrary>, id: String, slot: ImageSlot) -> AppResult<BookMeta> {
    lock(&state)?.with_book(&id, |dir, meta| {
        book::clear_image(dir, meta, slot)?;
        Ok(BookMeta::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn book_insert_image(window: WebviewWindow, state: State<'_, SharedLibrary>, id: String) -> AppResult<Option<String>> {
    let Some(src) = pick_image(&window) else { return Ok(None) };
    let dir = lock(&state)?.dir_of(&id)?;
    book::insert_image(&dir, &src).map(Some)
}

/// Copies an image the user dropped on the window into the book; returns its book-relative path.
#[tauri::command]
pub async fn book_import_image(state: State<'_, SharedLibrary>, id: String, path: PathBuf) -> AppResult<String> {
    let dir = lock(&state)?.dir_of(&id)?;
    book::insert_image(&dir, &path)
}
