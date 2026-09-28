use std::{collections::HashSet, fs, path::Path};

use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};

use super::dialog::pick_scrivener;
use crate::error::AppResult;
use crate::scrivener::{
    import::{import_into, import_new_book, Outcome},
    project::Project,
    scan::{scan, ScanView},
};
use crate::state::{lock, SharedLibrary};

#[derive(Deserialize, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ImportTarget {
    New,
    Book { id: String },
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub book_id: String,
    pub chapters: usize,
    pub items: usize,
    pub warnings: usize,
}

impl ImportResult {
    fn new(book_id: String, out: Outcome) -> Self {
        Self { book_id, chapters: out.chapters, items: out.items, warnings: out.warnings }
    }
}

#[tauri::command]
pub async fn scrivener_pick(window: WebviewWindow) -> AppResult<Option<String>> {
    Ok(pick_scrivener(&window).map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub async fn scrivener_scan(path: String) -> AppResult<ScanView> {
    scan(&Project::open(Path::new(&path))?)
}

#[tauri::command]
pub async fn scrivener_import(
    state: State<'_, SharedLibrary>,
    path: String,
    // Keys of the binder items that each become one chapter.
    chapter_items: Vec<String>,
    target: ImportTarget,
) -> AppResult<ImportResult> {
    let project = Project::open(Path::new(&path))?;
    let set: HashSet<String> = chapter_items.into_iter().collect();
    match target {
        ImportTarget::New => {
            let mut lib = lock(&state)?;
            fs::create_dir_all(&lib.root)?;
            let (dir, meta, out) = import_new_book(&lib.root.clone(), &project, &set)?;
            lib.register(&dir, &meta);
            Ok(ImportResult::new(meta.id, out))
        }
        ImportTarget::Book { id } => {
            let mut lib = lock(&state)?;
            let before = lib.total_of(&id);
            let out = lib.with_book(&id, |dir, meta| import_into(&project, &set, dir, meta, Some(&project.title)))?;
            let words = lib.total_of(&id).saturating_sub(before);
            lib.absorb(words);
            Ok(ImportResult::new(id, out))
        }
    }
}
