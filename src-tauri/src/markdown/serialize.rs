use super::parse::{IMAGE_PREFIX, SEPARATOR_LINE};
use crate::model::doc::{Block, Doc, Inline};

/// Writes a document back to chapter markdown. Empty paragraphs are dropped.
pub fn serialize(doc: &Doc) -> String {
    let parts: Vec<String> = doc.content.iter().filter_map(block_md).collect();
    if parts.is_empty() { String::new() } else { parts.join("\n\n") + "\n" }
}

fn block_md(block: &Block) -> Option<String> {
    match block {
        Block::Paragraph { content, .. } => {
            let mut lines = vec![String::new()];
            for inline in content {
                match inline {
                    Inline::Text { text, .. } => lines.last_mut().expect("never empty").push_str(text),
                    Inline::HardBreak => lines.push(String::new()),
                }
            }
            // A trailing blank line would reload as a paragraph break, leaving a
            // stray `\` on the line before it; drop such lines instead.
            while lines.len() > 1 && lines.last().is_some_and(|l| l.trim().is_empty()) {
                lines.pop();
            }
            let s = lines.join("\\\n");
            if s.trim().is_empty() { None } else { Some(s) }
        }
        Block::Separator => Some(SEPARATOR_LINE.to_string()),
        Block::Image { attrs } => Some(format!("{IMAGE_PREFIX}{})", attrs.src)),
    }
}
