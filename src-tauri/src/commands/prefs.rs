use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

use crate::error::{AppError, AppResult};
use crate::model::prefs::{Prefs, PrefsPatch};

const STORE_FILE: &str = "prefs.json";
const KEY: &str = "prefs";

fn read(app: &AppHandle) -> AppResult<Prefs> {
    let store = app.store(STORE_FILE).map_err(|e| AppError::msg(format!("Preferências indisponíveis: {e}")))?;
    Ok(store.get(KEY).and_then(|v| serde_json::from_value(v).ok()).unwrap_or_default())
}

#[tauri::command]
pub async fn prefs_get(app: AppHandle) -> AppResult<Prefs> {
    read(&app)
}

#[tauri::command]
pub async fn prefs_set(app: AppHandle, patch: PrefsPatch) -> AppResult<Prefs> {
    let prefs = read(&app)?.apply(patch);
    let store = app.store(STORE_FILE).map_err(|e| AppError::msg(format!("Preferências indisponíveis: {e}")))?;
    store.set(KEY, serde_json::to_value(&prefs)?);
    store.save().map_err(|e| AppError::msg(format!("Não foi possível salvar as preferências: {e}")))?;
    Ok(prefs)
}
