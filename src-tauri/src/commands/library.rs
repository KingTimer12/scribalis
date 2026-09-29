use tauri::State;

use crate::cloud::CloudState;
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
    let scan = ops::scan(&root)?;
    let books = {
        // Only the in-vault flag is needed per book, so read it once under the guard instead of
        // cloning the whole `CloudFile` (which can hold every enabled book and its snapshot history).
        let g = cloud.lock()?;
        scan.books
            .iter()
            .map(|(dir, meta)| {
                let (card, words) = ops::summarize(dir, meta);
                lib.register(dir, &meta.id, words);
                BookSummary { cloud: g.file.in_vault(&meta.id), ..card }
            })
            .collect()
    };
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
    let (card, words) = ops::summarize(&dir, &meta);
    lib.register(&dir, &meta.id, words);
    Ok(card)
}

#[tauri::command]
pub async fn library_rename(state: State<'_, SharedLibrary>, id: String, title: String) -> AppResult<BookSummary> {
    let mut lib = lock(&state)?;
    lib.with_book(&id, |dir, meta| {
        book::update(dir, meta, BookPatch { title: Some(title), ..Default::default() })?;
        Ok(ops::summarize(dir, meta).0)
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
