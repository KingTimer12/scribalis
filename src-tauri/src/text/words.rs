use crate::model::doc::{Block, Doc, Inline};

/// Counts whitespace-separated words.
pub fn count_words(s: &str) -> usize {
    s.split_whitespace().count()
}

/// Plain text of a document: paragraphs joined by blank lines.
pub fn doc_text(doc: &Doc) -> String {
    let mut out = Vec::new();
    for block in &doc.content {
        if let Block::Paragraph { content, .. } = block {
            let line: Vec<&str> = content
                .iter()
                .map(|i| match i {
                    Inline::Text { text, .. } => text.as_str(),
                    Inline::HardBreak => "\n",
                })
                .collect();
            out.push(line.concat());
        }
    }
    out.join("\n\n")
}

pub fn doc_words(doc: &Doc) -> usize {
    count_words(&doc_text(doc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_words_across_whitespace_kinds() {
        assert_eq!(count_words("  um\tdois\n\ntrês  "), 3);
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words("— Então é hoje — murmurou"), 6);
    }

    #[test]
    fn doc_words_ignore_separators_and_images() {
        let doc = crate::markdown::parse::parse("um dois\n\n***\n\n![](../imagens/a.png)\n\ntrês");
        assert_eq!(doc_words(&doc), 3);
    }
}
