//! Fetches open comment threads, appends them to the notes and resolves them on the server.
use tauri::{AppHandle, Manager};

use super::{
    api::{CommentList, ResolveBody},
    comments,
    error::CloudResult,
    CloudState,
};
use crate::state::{lock, SharedLibrary};

fn pending(cloud: &CloudState, book_id: &str) -> CloudResult<Vec<String>> {
    Ok(cloud.lock()?.file.book(book_id).map(|b| b.pending_resolve.clone()).unwrap_or_default())
}

/// Returns how many threads were added to the notes. Notes are written before resolving;
/// a thread whose resolution fails stays in `pending_resolve` and is never copied twice.
pub async fn fetch(app: &AppHandle, book_id: &str, utc_offset_min: i32) -> CloudResult<usize> {
    let cloud = app.state::<CloudState>();
    let client = cloud.vault_client()?;
    let list: CommentList = client.get(&format!("/books/{book_id}/comments?status=open")).await?;
    let skip = pending(&cloud, book_id)?;
    let threads = comments::threads(&list.comments, &skip);
    let written = if threads.is_empty() {
        Vec::new()
    } else {
        lock(&app.state::<SharedLibrary>())?
            .with_book(book_id, |dir, meta| comments::apply(dir, meta, &threads, utc_offset_min))?
    };
    if !written.is_empty() {
        cloud.edit(|f| f.book_mut(book_id).pending_resolve.extend(written.iter().cloned()))?;
    }
    for id in pending(&cloud, book_id)? {
        let path = format!("/books/{book_id}/comments/{id}");
        let done = match client.patch::<_, serde_json::Value>(&path, &ResolveBody { resolved: true }).await {
            Ok(_) => true,
            Err(e) => e.status == 404,
        };
        if done {
            cloud.edit(|f| f.book_mut(book_id).pending_resolve.retain(|x| x != &id))?;
        }
    }
    Ok(written.len())
}
