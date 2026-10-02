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
                .map(Inline::plain)
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

    #[test]
    fn a_mention_counts_as_the_name_it_shows() {
        let doc = crate::markdown::parse::parse("Viu @[Ana Lírio](x1) chegar");
        assert_eq!(doc_text(&doc), "Viu Ana Lírio chegar");
        assert_eq!(doc_words(&doc), 4);
        assert_eq!(crate::markdown::serialize::serialize(&doc).trim(), "Viu @[Ana Lírio](x1) chegar");
    }

    #[test]
    fn a_wiki_link_counts_as_its_alias() {
        let doc = crate::markdown::parse::parse("Lembrou [[aquela noite]](x1) e [[]](x2) depois");
        assert_eq!(doc_text(&doc), "Lembrou aquela noite e  depois");
        assert_eq!(doc_words(&doc), 5);
        assert_eq!(crate::markdown::serialize::serialize(&doc).trim(), "Lembrou [[aquela noite]](x1) e [[]](x2) depois");
    }
}
