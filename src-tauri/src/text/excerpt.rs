use crate::model::doc::{Block, Doc, Inline};

/// The opening of a document as one line: whitespace collapsed, cut at `max` characters with
/// an ellipsis. Stops reading as soon as it has enough, so long chapters cost little.
pub fn excerpt(doc: &Doc, max: usize) -> String {
    let mut out = String::new();
    let mut len = 0;
    let mut gap = false;
    for block in &doc.content {
        let Block::Paragraph { content, .. } = block else { continue };
        for inline in content {
            let text = match inline {
                Inline::Text { text, .. } => text.as_str(),
                Inline::HardBreak => " ",
            };
            for c in text.chars() {
                if c.is_whitespace() {
                    gap = len > 0;
                    continue;
                }
                if gap {
                    out.push(' ');
                    len += 1;
                    gap = false;
                }
                if len >= max {
                    return out.trim_end().to_string() + "…";
                }
                out.push(c);
                len += 1;
            }
        }
        gap = len > 0;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;

    #[test]
    fn joins_paragraphs_on_one_line() {
        let doc = parse("Era uma   vez.\n\nUm *reino*.");
        assert_eq!(excerpt(&doc, 100), "Era uma vez. Um reino.");
    }

    #[test]
    fn cuts_with_an_ellipsis() {
        let doc = parse("abcdef ghij");
        assert_eq!(excerpt(&doc, 6), "abcdef…");
        assert_eq!(excerpt(&doc, 7), "abcdef…");
        assert_eq!(excerpt(&doc, 11), "abcdef ghij");
    }

    #[test]
    fn empty_document_gives_nothing() {
        assert_eq!(excerpt(&Doc::default(), 10), "");
    }
}
