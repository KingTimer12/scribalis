//! Public links to a chapter or to (part of) the workspace.
use serde::Deserialize;
use tauri::{AppHandle, Manager};

use super::{
    api::{Share, ShareBody, ShareList, SharePatch, ShareResponse},
    backup,
    error::{CloudError, CloudResult},
    CloudState,
};

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ShareInput {
    pub book_id: String,
    /// "chapter" or "workspace".
    pub kind: String,
    pub target: Option<String>,
    /// Pin the current backup instead of following new ones.
    pub freeze: bool,
    pub include_notes: bool,
    pub allow_comments: bool,
    pub expires_in_days: Option<u32>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ShareChange {
    pub freeze: Option<bool>,
    pub include_notes: Option<bool>,
    pub allow_comments: Option<bool>,
    pub expires_in_days: Option<u32>,
    #[serde(default)]
    pub clear_expiry: bool,
}

fn no_snapshot() -> CloudError {
    CloudError::new("no_snapshot", "Faça um backup antes de congelar a versão.")
}

fn patch_for(change: ShareChange, last_snapshot: Option<String>) -> CloudResult<SharePatch> {
    let snapshot_id = match change.freeze {
        Some(true) => Some(last_snapshot.ok_or_else(no_snapshot)?),
        Some(false) => Some("latest".to_string()),
        None => None,
    };
    let expires_in_days = if change.clear_expiry { Some(None) } else { change.expires_in_days.map(Some) };
    Ok(SharePatch { snapshot_id, include_notes: change.include_notes, allow_comments: change.allow_comments, expires_in_days })
}

fn last_snapshot(cloud: &CloudState, book_id: &str) -> CloudResult<Option<String>> {
    Ok(cloud.lock()?.file.book(book_id).and_then(|b| b.last_snapshot_id.clone()))
}

/// Links need a backup: the book is enabled and backed up first, so the link shows the current text.
/// The backup runs `manual`, like "Fazer backup agora", so it is never skipped for being paused or
/// unchanged-this-session; if another backup of the book is already in flight, `require_fresh_backup`
/// turns that `Skipped` into the same `backup_running` error restore uses, instead of creating a link
/// that could point at a snapshot older than the text the author currently sees.
pub async fn create(app: &AppHandle, input: ShareInput) -> CloudResult<Share> {
    let cloud = app.state::<CloudState>();
    cloud.edit(|f| f.book_mut(&input.book_id).enabled = true)?;
    backup::require_fresh_backup(backup::run(app, &input.book_id, true).await)?;
    let snapshot_id = if input.freeze {
        last_snapshot(&cloud, &input.book_id)?.ok_or_else(no_snapshot)?
    } else {
        "latest".to_string()
    };
    let body = ShareBody {
        book_id: input.book_id,
        kind: input.kind,
        target: input.target,
        snapshot_id,
        include_notes: input.include_notes,
        allow_comments: input.allow_comments,
        expires_in_days: input.expires_in_days,
    };
    let res: ShareResponse = cloud.vault_client()?.post("/shares", &body).await?;
    Ok(res.share)
}

pub async fn list(cloud: &CloudState, book_id: &str) -> CloudResult<Vec<Share>> {
    let res: ShareList = cloud.vault_client()?.get("/shares").await?;
    Ok(res.shares.into_iter().filter(|s| s.book_id == book_id).collect())
}

pub async fn change(cloud: &CloudState, book_id: &str, id: &str, change: ShareChange) -> CloudResult<Share> {
    let patch = patch_for(change, last_snapshot(cloud, book_id)?)?;
    let res: ShareResponse = cloud.vault_client()?.patch(&format!("/shares/{id}"), &patch).await?;
    Ok(res.share)
}

pub async fn revoke(cloud: &CloudState, id: &str) -> CloudResult<()> {
    cloud.vault_client()?.delete(&format!("/shares/{id}")).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn change_becomes_a_patch() {
        let c = ShareChange { freeze: Some(false), clear_expiry: true, ..Default::default() };
        let p = patch_for(c, None).unwrap();
        assert_eq!(serde_json::to_string(&p).unwrap(), r#"{"snapshotId":"latest","expiresInDays":null}"#);
        let c = ShareChange { freeze: Some(true), expires_in_days: Some(7), ..Default::default() };
        let p = patch_for(c, Some("snp_1".into())).unwrap();
        assert_eq!(serde_json::to_string(&p).unwrap(), r#"{"snapshotId":"snp_1","expiresInDays":7}"#);
        assert!(patch_for(ShareChange { freeze: Some(true), ..Default::default() }, None).is_err());
    }
}
