use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

use super::dialog::pick_files;
use crate::error::{AppError, AppResult};
use crate::model::{doc::Doc, workspace::{Node, NodeKind}};
use crate::ops::workspace as ops;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn workspace_tree(state: State<'_, SharedLibrary>, book_id: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::tree(dir))
}

#[tauri::command]
pub async fn workspace_create(
    state: State<'_, SharedLibrary>,
    book_id: String,
    parent: Option<String>,
    index: usize,
    kind: NodeKind,
    title: String,
) -> AppResult<ops::Created> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::create(dir, parent.as_deref(), index, kind, &title))
}

#[tauri::command]
pub async fn workspace_rename(state: State<'_, SharedLibrary>, book_id: String, id: String, title: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::rename(dir, &id, &title))
}

#[tauri::command]
pub async fn workspace_set_notes(state: State<'_, SharedLibrary>, book_id: String, id: String, notes: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::set_notes(dir, &id, &notes))
}

#[tauri::command]
pub async fn workspace_set_synopsis(
    state: State<'_, SharedLibrary>,
    book_id: String,
    id: String,
    synopsis: String,
) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::set_synopsis(dir, &id, &synopsis))
}

/// Moving across the Manuscrito's edge converts texts ⇄ chapters. Words that enter the
/// chapters were not typed today, and words that leave them were not erased: the daily
/// count stays where it was.
#[tauri::command]
pub async fn workspace_move(
    state: State<'_, SharedLibrary>,
    book_id: String,
    id: String,
    parent: Option<String>,
    index: usize,
) -> AppResult<Vec<Node>> {
    let mut lib = lock(&state)?;
    let before = lib.total_of(&book_id);
    let items = lib.with_book(&book_id, |dir, _meta| ops::move_to(dir, &id, parent.as_deref(), index))?;
    let after = lib.total_of(&book_id);
    if after > before {
        lib.absorb(after - before);
    } else {
        lib.release(before - after);
    }
    Ok(items)
}

#[tauri::command]
pub async fn workspace_delete(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::delete(dir, &id))
}

#[tauri::command]
pub async fn workspace_load_doc(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<Doc> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::load_doc(dir, &id))
}

#[tauri::command]
pub async fn workspace_save_doc(state: State<'_, SharedLibrary>, book_id: String, id: String, doc: Doc) -> AppResult<()> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::save_doc(dir, &id, &doc))
}

#[tauri::command]
pub async fn workspace_pick_files(
    window: WebviewWindow,
    state: State<'_, SharedLibrary>,
    book_id: String,
    parent: Option<String>,
) -> AppResult<Option<Vec<Node>>> {
    // The dialog runs before locking so the state is never held while the user browses.
    let paths = pick_files(&window);
    if paths.is_empty() {
        return Ok(None);
    }
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::import_files(dir, parent.as_deref(), &paths)).map(Some)
}

#[tauri::command]
pub async fn workspace_open_file(app: AppHandle, state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<()> {
    let path = lock(&state)?.with_book(&book_id, |dir, _meta| ops::file_path(dir, &id))?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|_| AppError::msg("Não foi possível abrir o arquivo"))
}
