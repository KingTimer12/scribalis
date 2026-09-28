mod commands;
mod cloud;
mod error;
mod ids;
mod markdown;
mod model;
mod ops;
mod samples;
mod scrivener;
mod state;
mod storage;
mod text;
mod update;
mod window;

use std::sync::Mutex;

use tauri::Manager;

use cloud::{status::CLOUD_FILE, CloudState};
use commands::{
    book, chapter, cloud_backup, cloud_share, cloud_vault, library, prefs, scrivener as scrivener_cmd, stats, update as update_cmd, workspace,
};
use state::Library;
use storage::paths::ROOT_NAME;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // reqwest is built without a crypto provider (same as the updater): install ring once.
            let _ = rustls::crypto::ring::default_provider().install_default();
            let root = app.path().document_dir()?.join(ROOT_NAME);
            // Clean up any restore/download left mid-swap by a crash. Once at startup only: doing this
            // on every library listing could delete a staging folder while a restore is in flight.
            cloud::swap::recover(&root);
            app.manage(Mutex::new(Library::new(root)));
            let cloud_file = app.path().app_data_dir()?.join(CLOUD_FILE);
            app.manage(CloudState::load(cloud_file));
            cloud::scheduler::start(app.handle().clone());
            app.manage(update::PendingUpdate::default());
            let theme = prefs::read(app.handle()).map(|p| p.theme).unwrap_or_default();
            window::build_main(app, &theme)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            library::library_list,
            library::library_create,
            library::library_rename,
            library::library_delete,
            library::library_restore_samples,
            book::book_open,
            book::book_update,
            book::book_pick_image,
            book::book_clear_image,
            book::book_insert_image,
            book::book_import_image,
            chapter::chapter_load,
            chapter::chapter_save,
            chapter::chapter_update,
            chapter::chapter_insert,
            chapter::chapter_split,
            chapter::chapter_move,
            chapter::chapter_delete,
            chapter::chapter_search,
            chapter::chapter_markdown,
            prefs::prefs_get,
            prefs::prefs_set,
            stats::stats_today,
            update_cmd::update_check,
            update_cmd::update_install,
            workspace::workspace_tree,
            workspace::workspace_create,
            workspace::workspace_rename,
            workspace::workspace_set_notes,
            workspace::workspace_move,
            workspace::workspace_delete,
            workspace::workspace_load_doc,
            workspace::workspace_save_doc,
            workspace::workspace_pick_files,
            workspace::workspace_to_chapter,
            workspace::workspace_from_chapter,
            workspace::workspace_open_file,
            scrivener_cmd::scrivener_pick,
            scrivener_cmd::scrivener_scan,
            scrivener_cmd::scrivener_import,
            cloud_vault::cloud_overview,
            cloud_vault::cloud_set_api_url,
            cloud_vault::cloud_activate,
            cloud_vault::cloud_connect,
            cloud_vault::cloud_vault_info,
            cloud_vault::cloud_keys,
            cloud_vault::cloud_add_key,
            cloud_vault::cloud_revoke_key,
            cloud_vault::cloud_delete_vault,
            cloud_vault::cloud_remote_books,
            cloud_backup::cloud_book_state,
            cloud_backup::cloud_set_enabled,
            cloud_backup::cloud_backup,
            cloud_backup::cloud_snapshots,
            cloud_backup::cloud_forget_book,
            cloud_backup::cloud_backup_on_close,
            cloud_backup::cloud_restore,
            cloud_backup::cloud_download,
            cloud_share::cloud_shares,
            cloud_share::cloud_share_create,
            cloud_share::cloud_share_change,
            cloud_share::cloud_share_revoke,
            cloud_share::cloud_fetch_comments,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
