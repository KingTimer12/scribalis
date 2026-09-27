use super::parse::{IMAGE_PREFIX, SEPARATOR_LINE};
use crate::model::doc::{Block, Doc, Inline};

/// Writes a document back to chapter markdown. Empty paragraphs are dropped.
pub fn serialize(doc: &Doc) -> String {
    let parts: Vec<String> = doc.content.iter().filter_map(block_md).collect();
    if parts.is_empty() { String::new() } else { parts.join("\n\n") + "\n" }
}

fn block_md(block: &Block) -> Option<String> {
    match block {
        Block::Paragraph { content } => {
            let mut s = String::new();
            for inline in content {
                match inline {
                    Inline::Text { text } => s.push_str(text),
                    Inline::HardBreak => s.push_str("\\\n"),
                }
            }
            let s = s.trim_end_matches("\\\n").to_string();
            if s.trim().is_empty() { None } else { Some(s) }
        }
        Block::Separator => Some(SEPARATOR_LINE.to_string()),
        Block::Image { attrs } => Some(format!("{IMAGE_PREFIX}{})", attrs.src)),
    }
}
