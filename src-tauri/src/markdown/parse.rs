use super::{attrs, inline};
use crate::model::doc::{Block, Doc, ImageAttrs, Inline, ParaAttrs};

pub const SEPARATOR_LINE: &str = "***";
pub const IMAGE_PREFIX: &str = "![](../";

/// Parses the app's chapter markdown: paragraphs split by blank lines,
/// `***` separator lines, `![](../path)` image lines, `\` hard breaks,
/// bold/italic runs, and a trailing `{: …}` line holding paragraph attrs.
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
    // A trailing `{: …}` line holds the paragraph's formatting.
    let mut attrs = ParaAttrs::default();
    if lines.len() > 1 {
        if let Some(a) = attrs::parse(lines[lines.len() - 1]) {
            attrs = a;
            lines.pop();
        }
    }
    let mut content = Vec::new();
    for (i, line) in lines.iter().enumerate() {
        if i > 0 {
            content.push(Inline::HardBreak);
        }
        // Only non-final lines end with the `\` hard-break marker.
        let is_last_line = i == lines.len() - 1;
        let text = if is_last_line { *line } else { line.strip_suffix('\\').unwrap_or(line) };
        content.extend(inline::parse_line(text));
    }
    blocks.push(Block::Paragraph { attrs, content });
    lines.clear();
}
