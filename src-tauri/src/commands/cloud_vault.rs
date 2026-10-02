//! Vault, device keys, API address and the list of books on the server.
use serde::Serialize;
use tauri::State;

use crate::cloud::{
    api::{BookList, KeyInfo, KeyList, LabelBody, NewKey, NewKeyResponse, VaultCreated, VaultInfo},
    client::Client,
    config::{normalize_api_url, DEFAULT_API_URL},
    crypto::{self, VaultKey},
    keychain, CloudState,
};
use crate::error::{AppError, AppResult};
use crate::state::{lock, SharedLibrary};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudOverview {
    pub api_url: String,
    pub default_api_url: &'static str,
    pub connected: bool,
    /// This computer holds the vault's encryption key (it may still be created on the first backup).
    pub has_crypt_key: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBookView {
    pub id: String,
    pub title: String,
    pub snapshots: u64,
    pub latest_at: Option<u64>,
    pub open_comments: u64,
    /// Already on this computer.
    pub local: bool,
}

fn overview(cloud: &CloudState) -> AppResult<CloudOverview> {
    let (api_url, connected) = {
        let g = cloud.lock()?;
        (g.file.api_url().to_string(), g.file.has_vault())
    };
    // A keychain hiccup only hides the flag; backups report their own errors.
    let has_crypt_key = connected && cloud.vault_key().ok().flatten().is_some();
    Ok(CloudOverview { api_url, default_api_url: DEFAULT_API_URL, connected, has_crypt_key })
}

#[tauri::command]
pub async fn cloud_overview(cloud: State<'_, CloudState>) -> AppResult<CloudOverview> {
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_set_api_url(cloud: State<'_, CloudState>, url: String) -> AppResult<CloudOverview> {
    let url = normalize_api_url(&url)?;
    cloud.edit(|f| f.api_url = if url == DEFAULT_API_URL { None } else { Some(url) })?;
    cloud.reset_key()?;
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_activate(cloud: State<'_, CloudState>, label: String) -> AppResult<CloudOverview> {
    if cloud.lock()?.file.has_vault() {
        return Err(AppError::msg("Este computador já está conectado a um cofre."));
    }
    let url = cloud.lock()?.file.api_url().to_string();
    let created: VaultCreated = Client::new(&url, None)?.post("/vaults", &LabelBody { label: label.trim() }).await?;
    keychain::write(&url, &created.key.secret)?;
    cloud.set_key(Some(created.key.secret))?;
    cloud.store_vault_key(Some(&VaultKey::generate()?))?;
    cloud.edit(|f| {
        let s = f.server_mut();
        s.vault_id = Some(created.vault.id);
        s.key_id = Some(created.key.id);
    })?;
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_connect(cloud: State<'_, CloudState>, secret: String) -> AppResult<CloudOverview> {
    // The code from "Adicionar computador" carries the encryption key after the device secret.
    let (secret, crypt) = crypto::split_code(&secret);
    if !secret.starts_with("scb_") {
        return Err(AppError::msg("Código inválido. Ele começa com scb_."));
    }
    let url = cloud.lock()?.file.api_url().to_string();
    // Only a key the server accepts goes to the keychain.
    let info: VaultInfo = Client::new(&url, Some(secret.clone()))?.get("/vault").await?;
    keychain::write(&url, &secret)?;
    cloud.set_key(Some(secret))?;
    // An old code without the key keeps whatever this computer has; with none, a later backup
    // creates one (see `ensure_vault_key`).
    if let Some(k) = &crypt {
        cloud.store_vault_key(Some(k))?;
    }
    cloud.edit(|f| {
        let s = f.server_mut();
        s.vault_id = Some(info.id);
        s.key_id = Some(info.key_id);
    })?;
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_vault_info(cloud: State<'_, CloudState>) -> AppResult<VaultInfo> {
    Ok(cloud.vault_client()?.get("/vault").await?)
}

#[tauri::command]
pub async fn cloud_keys(cloud: State<'_, CloudState>) -> AppResult<Vec<KeyInfo>> {
    let list: KeyList = cloud.vault_client()?.get("/vault/keys").await?;
    Ok(list.keys)
}

/// New key for another computer. The only time a secret reaches the webview, to be copied. The code
/// shown carries the encryption key too, so the other computer opens encrypted backups with no password.
#[tauri::command]
pub async fn cloud_add_key(cloud: State<'_, CloudState>, label: String) -> AppResult<NewKey> {
    let crypt = cloud.ensure_vault_key()?;
    let mut res: NewKeyResponse = cloud.vault_client()?.post("/vault/keys", &LabelBody { label: label.trim() }).await?;
    res.key.secret = crypto::join_code(&res.key.secret, Some(&crypt));
    Ok(res.key)
}

/// "Trazer chave": takes the encryption key from a code made on another computer, for computers that
/// joined the vault before backups were encrypted. The device key stays as it is.
#[tauri::command]
pub async fn cloud_import_crypt_key(cloud: State<'_, CloudState>, code: String) -> AppResult<CloudOverview> {
    let (_, crypt) = crypto::split_code(&code);
    let crypt = crypt.ok_or_else(|| AppError::msg("Este código não traz a chave de criptografia. Gere um novo em \"Adicionar computador\"."))?;
    cloud.store_vault_key(Some(&crypt))?;
    // Hashes and fingerprints made with the old key no longer match what will be sent.
    {
        let mut g = cloud.lock()?;
        g.hashes = Default::default();
        g.sent.clear();
    }
    overview(&cloud)
}

#[tauri::command]
pub async fn cloud_revoke_key(cloud: State<'_, CloudState>, id: String) -> AppResult<Vec<KeyInfo>> {
    let client = cloud.vault_client()?;
    client.delete(&format!("/vault/keys/{id}")).await?;
    let list: KeyList = client.get("/vault/keys").await?;
    Ok(list.keys)
}

#[tauri::command]
pub async fn cloud_delete_vault(cloud: State<'_, CloudState>) -> AppResult<CloudOverview> {
    cloud.vault_client()?.delete("/vault").await?;
    let url = cloud.lock()?.file.api_url().to_string();
    keychain::delete(&url)?;
    cloud.set_key(None)?;
    cloud.store_vault_key(None)?;
    cloud.edit(|f| {
        f.servers.remove(&url);
    })?;
    overview(&cloud)
}

/// Books on the server; also refreshes which local books carry the "Nuvem" badge.
#[tauri::command]
pub async fn cloud_remote_books(cloud: State<'_, CloudState>, state: State<'_, SharedLibrary>) -> AppResult<Vec<RemoteBookView>> {
    let list: BookList = cloud.vault_client()?.get("/books").await?;
    cloud.edit(|f| {
        let server = f.server_mut();
        for b in server.books.values_mut() {
            b.last_backup_at = None;
        }
        for remote in &list.books {
            if let Some(latest) = &remote.latest {
                let b = server.books.entry(remote.id.clone()).or_default();
                b.last_backup_at = Some(latest.created_at);
                b.last_snapshot_id = Some(latest.id.clone());
            }
        }
    })?;
    let lib = lock(&state)?;
    Ok(list
        .books
        .into_iter()
        .map(|b| RemoteBookView {
            local: lib.dir_of(&b.id).is_ok(),
            latest_at: b.latest.as_ref().map(|s| s.created_at),
            id: b.id,
            title: b.title,
            snapshots: b.snapshots,
            open_comments: b.open_comments,
        })
        .collect())
}
