//! Visitors' comments become plain notes: each thread is appended to the notes of its chapter or
//! workspace item (or of an inbox text when the item was deleted).
use std::path::Path;

use super::api::Comment;
use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::Doc,
    metadata::Metadata,
    workspace::{find, find_mut, Node, NodeKind, Workspace},
};
use crate::storage::{
    metadata_io::write_metadata,
    workspace_io::{read_workspace, write_node_doc, write_workspace},
};

pub const INBOX_TITLE: &str = "Comentários recebidos";
const QUOTE_MAX: usize = 80;

pub struct Thread<'a> {
    pub root: &'a Comment,
    pub replies: Vec<&'a Comment>,
}

/// Roots (minus `skip`) with their replies, oldest first.
pub fn threads<'a>(comments: &'a [Comment], skip: &[String]) -> Vec<Thread<'a>> {
    let mut out: Vec<Thread> = comments
        .iter()
        .filter(|c| c.parent_id.is_none() && !skip.contains(&c.id))
        .map(|root| Thread { root, replies: Vec::new() })
        .collect();
    for c in comments.iter().filter(|c| c.parent_id.is_some()) {
        if let Some(t) = out.iter_mut().find(|t| c.parent_id.as_deref() == Some(t.root.id.as_str())) {
            t.replies.push(c);
        }
    }
    for t in &mut out {
        t.replies.sort_by_key(|c| c.created_at);
    }
    out.sort_by_key(|t| t.root.created_at);
    out
}

/// Days since 1970-01-01 → (year, month, day), proleptic Gregorian (Howard Hinnant's algorithm).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// "dd/mm hh:mm" in local time; `utc_offset_min` is local minus UTC (Brasília: -180).
pub fn short_datetime(ms: u64, utc_offset_min: i32) -> String {
    let secs = (ms / 1000) as i64 + i64::from(utc_offset_min) * 60;
    let (_, month, day) = civil_from_days(secs.div_euclid(86_400));
    let rem = secs.rem_euclid(86_400);
    format!("{day:02}/{month:02} {:02}:{:02}", rem / 3600, rem % 3600 / 60)
}

fn quote(exact: &str) -> String {
    let one_line = exact.split_whitespace().collect::<Vec<_>>().join(" ");
    if one_line.chars().count() <= QUOTE_MAX {
        return one_line;
    }
    let cut: String = one_line.chars().take(QUOTE_MAX).collect();
    format!("{}…", cut.trim_end())
}

pub fn format_thread(t: &Thread, orphan: bool, utc_offset_min: i32) -> String {
    let root = t.root;
    let mut head = format!("— {} · {}", root.author.name, short_datetime(root.created_at, utc_offset_min));
    if let Some(anchor) = &root.anchor {
        head.push_str(&format!(" · sobre “{}”", quote(&anchor.exact)));
    }
    if orphan {
        head.push_str(" (item apagado)");
    }
    let mut lines = vec![head, root.body.trim_end().to_string()];
    for reply in &t.replies {
        let mut body = reply.body.trim_end().lines();
        let first = body.next().unwrap_or("");
        let when = short_datetime(reply.created_at, utc_offset_min);
        lines.push(format!("  ↳ {} · {when}: {first}", reply.author.name));
        lines.extend(body.map(|l| format!("    {l}")));
    }
    lines.join("\n")
}

pub fn append_note(existing: &str, block: &str) -> String {
    let base = existing.trim_end();
    if base.is_empty() { block.to_string() } else { format!("{base}\n\n{block}") }
}

enum Target {
    Chapter(usize),
    Node,
    Inbox,
}

/// Root-level text that collects threads whose item no longer exists; created on first use.
fn inbox<'a>(dir: &Path, ws: &'a mut Workspace) -> AppResult<&'a mut Node> {
    let found = ws.items.iter().position(|n| n.kind == NodeKind::Text && n.title == INBOX_TITLE);
    let i = match found {
        Some(i) => i,
        None => {
            let id = new_id();
            let file = format!("{id}.md");
            write_node_doc(dir, &file, &Doc::default())?;
            ws.items.push(Node::leaf(id, NodeKind::Text, INBOX_TITLE, &file));
            ws.items.len() - 1
        }
    };
    Ok(&mut ws.items[i])
}

/// Appends each thread to its item's notes and saves; returns the root ids written.
pub fn apply(dir: &Path, meta: &mut Metadata, threads: &[Thread], utc_offset_min: i32) -> AppResult<Vec<String>> {
    if threads.is_empty() {
        return Ok(Vec::new());
    }
    let mut ws = read_workspace(dir)?;
    let (mut meta_changed, mut ws_changed) = (false, false);
    let mut done = Vec::new();
    for t in threads {
        let node_id = t.root.node_id.as_str();
        let target = if let Some(i) = meta.chapters.iter().position(|c| c.id == node_id) {
            Target::Chapter(i)
        } else if find(&ws.items, node_id).is_some() {
            Target::Node
        } else {
            Target::Inbox
        };
        match target {
            Target::Chapter(i) => {
                let c = &mut meta.chapters[i];
                c.notes = append_note(&c.notes, &format_thread(t, false, utc_offset_min));
                meta_changed = true;
            }
            Target::Node => {
                if let Some(n) = find_mut(&mut ws.items, node_id) {
                    n.notes = append_note(&n.notes, &format_thread(t, false, utc_offset_min));
                    ws_changed = true;
                }
            }
            Target::Inbox => {
                let n = inbox(dir, &mut ws)?;
                n.notes = append_note(&n.notes, &format_thread(t, true, utc_offset_min));
                ws_changed = true;
            }
        }
        done.push(t.root.id.clone());
    }
    if ws_changed {
        write_workspace(dir, &ws)?;
    }
    if meta_changed {
        meta.updated_at = now_ms();
        write_metadata(dir, meta)?;
    }
    Ok(done)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::cloud::api::{Anchor, Author};
    use crate::ops::{library::create_book, workspace};

    fn comment(id: &str, parent: Option<&str>, node: &str, body: &str, at: u64) -> Comment {
        Comment {
            id: id.into(),
            parent_id: parent.map(Into::into),
            node_id: node.into(),
            anchor: None,
            body: body.into(),
            author: Author { name: "Mira".into(), kind: "guest".into() },
            created_at: at,
        }
    }

    #[test]
    fn formats_utc_date_with_offset() {
        assert_eq!(short_datetime(1_790_000_000_000, 0), "21/09 14:13");
        assert_eq!(short_datetime(1_790_000_000_000, -180), "21/09 11:13");
    }

    #[test]
    fn groups_replies_under_roots_and_skips_pending() {
        let list = vec![
            comment("r1", None, "c1", "a", 1),
            comment("x", Some("r1"), "c1", "b", 3),
            comment("r2", None, "c1", "c", 2),
            comment("y", Some("r1"), "c1", "d", 2),
        ];
        let t = threads(&list, &[]);
        assert_eq!(t.len(), 2);
        assert_eq!(t[0].replies.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(), vec!["y", "x"]);
        assert_eq!(threads(&list, &["r1".into()]).len(), 1);
    }

    #[test]
    fn formats_a_thread_with_quote_and_indented_multiline_reply() {
        let mut root = comment("r1", None, "c1", "Achei confuso aqui.", 1_790_000_000_000);
        root.anchor = Some(Anchor { exact: "cheiro de\nferrugem".into() });
        let reply = comment("x", Some("r1"), "c1", "Linha um\nLinha dois", 1_790_000_060_000);
        let t = Thread { root: &root, replies: vec![&reply] };
        assert_eq!(
            format_thread(&t, false, 0),
            "— Mira · 21/09 14:13 · sobre “cheiro de ferrugem”\nAchei confuso aqui.\n  ↳ Mira · 21/09 14:14: Linha um\n    Linha dois"
        );
    }

    #[test]
    fn long_quotes_are_cut_and_orphans_marked() {
        let mut root = comment("r1", None, "c1", "x", 0);
        root.anchor = Some(Anchor { exact: "a".repeat(100) });
        let text = format_thread(&Thread { root: &root, replies: vec![] }, true, 0);
        assert!(text.contains(&format!("“{}…”", "a".repeat(80))));
        assert!(text.lines().next().unwrap().ends_with("(item apagado)"));
    }

    #[test]
    fn appends_after_a_blank_line() {
        assert_eq!(append_note("", "novo"), "novo");
        assert_eq!(append_note("antigo\n\n", "novo"), "antigo\n\nnovo");
    }

    #[test]
    fn writes_to_chapter_node_and_inbox_and_reuses_the_inbox() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "A").unwrap();
        let chapter = meta.chapters[0].id.clone();
        let node = workspace::create(&dir, None, 0, NodeKind::Text, "Ficha").unwrap().id;
        let list = vec![
            comment("r1", None, &chapter, "no capítulo", 1),
            comment("r2", None, &node, "na ficha", 2),
            comment("r3", None, "apagado", "sem destino", 3),
        ];
        let done = apply(&dir, &mut meta, &threads(&list, &[]), 0).unwrap();
        assert_eq!(done, vec!["r1", "r2", "r3"]);
        assert!(meta.chapters[0].notes.contains("no capítulo"));
        let saved = crate::storage::metadata_io::read_metadata(&dir).unwrap();
        assert!(saved.chapters[0].notes.contains("no capítulo"));
        let ws = read_workspace(&dir).unwrap();
        assert!(find(&ws.items, &node).unwrap().notes.contains("na ficha"));
        let inbox: Vec<&Node> = ws.items.iter().filter(|n| n.title == INBOX_TITLE).collect();
        assert_eq!(inbox.len(), 1);
        assert!(inbox[0].notes.contains("sem destino"));

        let more = vec![comment("r4", None, "sumiu", "outro", 4)];
        apply(&dir, &mut meta, &threads(&more, &[]), 0).unwrap();
        let ws = read_workspace(&dir).unwrap();
        let inbox: Vec<&Node> = ws.items.iter().filter(|n| n.title == INBOX_TITLE).collect();
        assert_eq!(inbox.len(), 1);
        assert!(inbox[0].notes.contains("sem destino") && inbox[0].notes.contains("outro"));
    }
}
