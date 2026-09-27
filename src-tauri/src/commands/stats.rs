use serde::Serialize;
use tauri::State;

use crate::error::AppResult;
use crate::state::{lock, SharedLibrary};

#[derive(Serialize)]
pub struct Today {
    pub today: usize,
}

#[tauri::command]
pub async fn stats_today(state: State<'_, SharedLibrary>) -> AppResult<Today> {
    Ok(Today { today: lock(&state)?.today() })
}
