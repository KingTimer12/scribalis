use tauri::State;

use crate::cloud::{swap, CloudState};
use crate::error::AppResult;
use crate::model::{patches::BookPatch, views::{BookSummary, LibraryListing}};
use crate::ops::{book, library as ops};
use crate::state::{lock, Library, SharedLibrary};

fn listing(lib: &mut Library, cloud: &CloudState) -> AppResult<LibraryListing> {
    let first_run = !lib.root.exists();
    std::fs::create_dir_all(&lib.root)?;
    if first_run {
        ops::write_samples(&lib.root)?;
    }
    let root = lib.root.clone();
    swap::recover(&root);
    let scan = ops::scan(&root)?;
    let file = cloud.lock()?.file.clone();
    let books = scan
        .books
        .iter()
        .map(|(dir, meta)| {
            lib.register(dir, meta);
            BookSummary { cloud: file.in_vault(&meta.id), ..BookSummary::from_meta(dir, meta) }
        })
        .collect();
    lib.start_session_if_needed();
    Ok(LibraryListing { books, warnings: scan.warnings })
}

#[tauri::command]
pub async fn library_list(state: State<'_, SharedLibrary>, cloud: State<'_, CloudState>) -> AppResult<LibraryListing> {
    let mut lib = lock(&state)?;
    listing(&mut lib, &cloud)
}

#[tauri::command]
pub async fn library_create(state: State<'_, SharedLibrary>, title: String) -> AppResult<BookSummary> {
    let mut lib = lock(&state)?;
    std::fs::create_dir_all(&lib.root)?;
    let (dir, meta) = ops::create_book(&lib.root, &title)?;
    lib.register(&dir, &meta);
    Ok(BookSummary::from_meta(&dir, &meta))
}

#[tauri::command]
pub async fn library_rename(state: State<'_, SharedLibrary>, id: String, title: String) -> AppResult<BookSummary> {
    let mut lib = lock(&state)?;
    lib.with_book(&id, |dir, meta| {
        book::update(dir, meta, BookPatch { title: Some(title), ..Default::default() })?;
        Ok(BookSummary::from_meta(dir, meta))
    })
}

#[tauri::command]
pub async fn library_delete(state: State<'_, SharedLibrary>, id: String) -> AppResult<()> {
    let mut lib = lock(&state)?;
    let dir = lib.dir_of(&id)?;
    ops::delete_book(&dir)?;
    lib.forget(&id);
    Ok(())
}

#[tauri::command]
pub async fn library_restore_samples(state: State<'_, SharedLibrary>, cloud: State<'_, CloudState>) -> AppResult<LibraryListing> {
    let mut lib = lock(&state)?;
    std::fs::create_dir_all(&lib.root)?;
    ops::write_samples(&lib.root)?;
    listing(&mut lib, &cloud)
}
