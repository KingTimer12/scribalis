use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

use super::dialog::pick_files;
use crate::error::{AppError, AppResult};
use crate::model::{doc::Doc, views::BookMeta, workspace::{Node, NodeKind}};
use crate::ops::workspace as ops;
use crate::state::{lock, SharedLibrary};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ToChapter {
    pub book: BookMeta,
    pub items: Vec<Node>,
}

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
pub async fn workspace_move(
    state: State<'_, SharedLibrary>,
    book_id: String,
    id: String,
    parent: Option<String>,
    index: usize,
) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::move_to(dir, &id, parent.as_deref(), index))
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
pub async fn workspace_to_chapter(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<ToChapter> {
    let mut lib = lock(&state)?;
    let before = lib.total_of(&book_id);
    let (book, items) = lib.with_book(&book_id, |dir, meta| {
        let items = ops::to_chapter(dir, meta, &id)?;
        Ok((BookMeta::from_meta(dir, meta), items))
    })?;
    let words = lib.total_of(&book_id).saturating_sub(before);
    lib.absorb(words);
    Ok(ToChapter { book, items })
}

#[tauri::command]
pub async fn workspace_open_file(app: AppHandle, state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<()> {
    let path = lock(&state)?.with_book(&book_id, |dir, _meta| ops::file_path(dir, &id))?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|_| AppError::msg("Não foi possível abrir o arquivo"))
}
