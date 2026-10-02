//! Character and place sheets of a book ("Fichas"). Each command holds the library lock while it
//! works, which also serializes the read-modify-write of the sheets file.
use tauri::State;

use crate::error::AppResult;
use crate::model::sheets::{FieldValue, SheetKind, Sheets};
use crate::ops::sheets::{self as ops, FieldInput, SheetCreated};
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn sheets_load(state: State<'_, SharedLibrary>, book_id: String) -> AppResult<Sheets> {
    let lib = lock(&state)?;
    let dir = lib.dir_of(&book_id)?;
    ops::load(&dir)
}

#[tauri::command]
pub async fn sheets_set_template(
    state: State<'_, SharedLibrary>,
    book_id: String,
    kind: SheetKind,
    fields: Vec<FieldInput>,
) -> AppResult<Sheets> {
    let lib = lock(&state)?;
    let dir = lib.dir_of(&book_id)?;
    ops::set_template(&dir, kind, fields)
}

#[tauri::command]
pub async fn sheets_create(state: State<'_, SharedLibrary>, book_id: String, kind: SheetKind, name: String) -> AppResult<SheetCreated> {
    let lib = lock(&state)?;
    let dir = lib.dir_of(&book_id)?;
    ops::create(&dir, kind, &name)
}

#[tauri::command]
pub async fn sheets_rename(state: State<'_, SharedLibrary>, book_id: String, id: String, name: String) -> AppResult<()> {
    let lib = lock(&state)?;
    let dir = lib.dir_of(&book_id)?;
    ops::rename(&dir, &id, &name)
}

#[tauri::command]
pub async fn sheets_set_value(
    state: State<'_, SharedLibrary>,
    book_id: String,
    id: String,
    field: String,
    value: Option<FieldValue>,
) -> AppResult<()> {
    let lib = lock(&state)?;
    let dir = lib.dir_of(&book_id)?;
    ops::set_value(&dir, &id, &field, value)
}

#[tauri::command]
pub async fn sheets_delete(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<Sheets> {
    let lib = lock(&state)?;
    let dir = lib.dir_of(&book_id)?;
    ops::delete(&dir, &id)
}
