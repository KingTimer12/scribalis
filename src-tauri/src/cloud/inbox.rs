//! Fetches open comment threads, appends them to the notes and resolves them on the server.
use std::collections::HashSet;

use tauri::{AppHandle, Manager};

use super::{
    api::{CommentList, ResolveBody},
    comments,
    error::CloudResult,
    CloudState,
};
use crate::ids::now_ms;
use crate::state::{lock, SharedLibrary};

fn pending(cloud: &CloudState, book_id: &str) -> CloudResult<Vec<String>> {
    Ok(cloud.lock()?.file.book(book_id).map(|b| b.pending_resolve.clone()).unwrap_or_default())
}

/// True the first time `book_id` starts fetching this session, false while a fetch is already in
/// flight for it. The notes drawer and the Cloud drawer both have a "Buscar comentários" button, so
/// two clicks (or the fetch-on-open plus a manual click) can race; the second one must not import
/// the same comments a second time.
fn start_fetch(fetching: &mut HashSet<String>, book_id: &str) -> bool {
    fetching.insert(book_id.to_string())
}

/// Returns how many threads were added to the notes. Notes are written before resolving;
/// a thread whose resolution fails stays in `pending_resolve` and is never copied twice.
pub async fn fetch(app: &AppHandle, book_id: &str, utc_offset_min: i32) -> CloudResult<usize> {
    let cloud = app.state::<CloudState>();
    if !start_fetch(&mut cloud.lock()?.fetching, book_id) {
        return Ok(0);
    }
    let result = fetch_once(app, &cloud, book_id, utc_offset_min).await;
    cloud.lock()?.fetching.remove(book_id);
    result
}

async fn fetch_once(app: &AppHandle, cloud: &CloudState, book_id: &str, utc_offset_min: i32) -> CloudResult<usize> {
    let client = cloud.vault_client()?;
    let list: CommentList = client.get(&format!("/books/{book_id}/comments?status=open")).await?;
    cloud.edit(|f| f.book_mut(book_id).last_comments_at = Some(now_ms()))?;
    let skip = pending(cloud, book_id)?;
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
    for id in pending(cloud, book_id)? {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_concurrent_fetch_for_the_same_book_is_refused() {
        let mut fetching = HashSet::new();
        assert!(start_fetch(&mut fetching, "b1"));
        assert!(!start_fetch(&mut fetching, "b1"));
        assert!(start_fetch(&mut fetching, "b2"));
        fetching.remove("b1");
        assert!(start_fetch(&mut fetching, "b1"));
    }
}
