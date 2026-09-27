use std::path::PathBuf;

use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

use crate::storage::images::ALLOWED_EXTENSIONS;

/// Native "open image" dialog. Blocking: call only from async commands.
pub fn pick_image(app: &AppHandle) -> Option<PathBuf> {
    app.dialog()
        .file()
        .add_filter("Imagens", &ALLOWED_EXTENSIONS)
        .blocking_pick_file()
        .and_then(|f| f.into_path().ok())
}
