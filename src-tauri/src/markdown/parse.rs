use crate::model::doc::{Block, Doc, ImageAttrs, Inline};

pub const SEPARATOR_LINE: &str = "***";
pub const IMAGE_PREFIX: &str = "![](../";

/// Parses the app's chapter markdown: paragraphs split by blank lines,
/// `***` separator lines, `![](../path)` image lines, `\` hard breaks.
pub fn parse(md: &str) -> Doc {
    let mut blocks = Vec::new();
    let mut lines: Vec<&str> = Vec::new();
    for line in md.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            flush(&mut lines, &mut blocks);
        } else if trimmed == SEPARATOR_LINE {
            flush(&mut lines, &mut blocks);
            blocks.push(Block::Separator);
        } else if let Some(src) = image_src(trimmed) {
            flush(&mut lines, &mut blocks);
            blocks.push(Block::Image { attrs: ImageAttrs { src } });
        } else {
            lines.push(line);
        }
    }
    flush(&mut lines, &mut blocks);
    Doc::new(blocks)
}

fn image_src(line: &str) -> Option<String> {
    let src = line.strip_prefix(IMAGE_PREFIX)?.strip_suffix(')')?;
    if src.is_empty() || src.contains(')') { None } else { Some(src.to_string()) }
}

fn flush(lines: &mut Vec<&str>, blocks: &mut Vec<Block>) {
    if lines.is_empty() {
        return;
    }
    let mut content = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            content.push(Inline::HardBreak);
        }
        // Only strip trailing \ on non-final lines (hard break markers).
        // The last line keeps its text verbatim.
        let is_last_line = i == lines.len() - 1;
        let text = if is_last_line {
            *line
        } else {
            line.strip_suffix('\\').unwrap_or(line)
        };
        if !text.is_empty() {
            content.push(Inline::Text { text: text.to_string() });
        }
    }
    blocks.push(Block::Paragraph { content });
    lines.clear();
}
