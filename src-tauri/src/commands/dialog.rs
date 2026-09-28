use std::path::PathBuf;

use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

use crate::storage::images::ALLOWED_EXTENSIONS;

/// Native "open image" dialog, modal to the calling window. Blocking: call only from async commands.
pub fn pick_image(window: &WebviewWindow) -> Option<PathBuf> {
    window
        .dialog()
        .file()
        .set_parent(window)
        .add_filter("Imagens", &ALLOWED_EXTENSIONS)
        .blocking_pick_file()
        .and_then(|f| f.into_path().ok())
}

/// Native multi-file picker, any file type. Blocking: call only from async commands.
pub fn pick_files(window: &WebviewWindow) -> Vec<PathBuf> {
    window
        .dialog()
        .file()
        .set_parent(window)
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|f| f.into_path().ok())
        .collect()
}
