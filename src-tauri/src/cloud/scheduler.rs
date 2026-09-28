//! Every 10 minutes, back up the enabled books that changed.
use std::time::Duration;

use tauri::AppHandle;

use super::backup;

const EVERY: Duration = Duration::from_secs(600);

pub fn start(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(EVERY).await;
            backup::run_all_changed(&app).await;
        }
    });
}
