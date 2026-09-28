use super::parse::{IMAGE_PREFIX, SEPARATOR_LINE};
use super::{attrs, inline};
use crate::model::doc::{Block, Doc};

/// Writes a document back to chapter markdown. Empty paragraphs are dropped.
pub fn serialize(doc: &Doc) -> String {
    serialize_with(doc, true)
}

/// Same as [`serialize`], but without the trailing `{: …}` attribute lines
/// (e.g. for copying a chapter's text to the clipboard).
pub fn serialize_without_attrs(doc: &Doc) -> String {
    serialize_with(doc, false)
}

fn serialize_with(doc: &Doc, include_attrs: bool) -> String {
    let parts: Vec<String> = doc.content.iter().filter_map(|b| block_md(b, include_attrs)).collect();
    if parts.is_empty() { String::new() } else { parts.join("\n\n") + "\n" }
}

fn block_md(block: &Block, include_attrs: bool) -> Option<String> {
    match block {
        Block::Paragraph { attrs: a, content } => {
            let mut lines = inline::serialize(content);
            // A trailing blank line would reload as a paragraph break, leaving a
            // stray `\` on the line before it; drop such lines instead.
            while lines.len() > 1 && lines.last().is_some_and(|l| l.trim().is_empty()) {
                lines.pop();
            }
            let s = lines.join("\\\n");
            if s.trim().is_empty() {
                return None;
            }
            Some(match include_attrs.then(|| attrs::serialize(a)).flatten() {
                Some(line) => format!("{s}\n{line}"),
                None => s,
            })
        }
        Block::Separator => Some(SEPARATOR_LINE.to_string()),
        Block::Image { attrs } => Some(format!("{IMAGE_PREFIX}{})", attrs.src)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Align, Block, Inline, ParaAttrs};

    #[test]
    fn serialize_without_attrs_drops_the_attribute_lines() {
        let centered = ParaAttrs { text_align: Some(Align::Center), ..Default::default() };
        let doc = Doc::new(vec![
            Block::Paragraph { attrs: centered, content: vec![Inline::text("Título")] },
            Block::Separator,
            Block::paragraph(vec![Inline::text("Texto simples")]),
        ]);
        assert_eq!(serialize(&doc), "Título\n{: align=center}\n\n***\n\nTexto simples\n");
        assert_eq!(serialize_without_attrs(&doc), "Título\n\n***\n\nTexto simples\n");
    }
}
