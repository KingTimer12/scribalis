pub mod attrs;
pub mod inline;
pub mod parse;
pub mod serialize;

#[cfg(test)]
mod tests {
    use super::{parse::parse, serialize::serialize};
    use crate::model::doc::{Align, Block, Doc, ImageAttrs, Inline, Marks, ParaAttrs};

    fn p(parts: Vec<Inline>) -> Block {
        Block::paragraph(parts)
    }
    fn t(s: &str) -> Inline {
        Inline::text(s)
    }
    fn pa(attrs: ParaAttrs, parts: Vec<Inline>) -> Block {
        Block::Paragraph { attrs, content: parts }
    }

    #[test]
    fn parses_all_block_kinds() {
        let md = "Primeiro\\\nsegunda linha\n\n***\n\n![](../imagens/a.png)\n\nFim\n";
        let doc = parse(md);
        assert_eq!(doc.content, vec![
            p(vec![t("Primeiro"), Inline::HardBreak, t("segunda linha")]),
            Block::Separator,
            Block::Image { attrs: ImageAttrs { src: "imagens/a.png".into() } },
            p(vec![t("Fim")]),
        ]);
    }

    #[test]
    fn roundtrip_keeps_user_text_literal() {
        let doc = Doc::new(vec![
            p(vec![t("*não é itálico* e \\ barra")]),
            p(vec![t("  começa com espaço")]),
            Block::Separator,
            p(vec![t("a"), Inline::HardBreak, t("b")]),
        ]);
        assert_eq!(parse(&serialize(&doc)), doc);
    }

    #[test]
    fn empty_paragraphs_are_dropped() {
        let doc = Doc::new(vec![p(vec![]), p(vec![t("x")]), p(vec![t("  ")])]);
        assert_eq!(serialize(&doc), "x\n");
    }

    #[test]
    fn empty_doc_is_empty_file() {
        assert_eq!(serialize(&Doc::default()), "");
        assert_eq!(parse(""), Doc::default());
    }

    #[test]
    fn single_newline_becomes_hard_break() {
        assert_eq!(parse("a\nb").content, vec![p(vec![t("a"), Inline::HardBreak, t("b")])]);
    }

    #[test]
    fn roundtrip_text_ending_with_backslash() {
        let doc = Doc::new(vec![p(vec![t("Isso acabou\\")])]);
        assert_eq!(parse(&serialize(&doc)), doc);
    }

    #[test]
    fn roundtrip_text_ending_with_backslash_before_hard_break() {
        let doc = Doc::new(vec![p(vec![t("a\\"), Inline::HardBreak, t("b")])]);
        assert_eq!(parse(&serialize(&doc)), doc);
    }

    #[test]
    fn whitespace_only_last_line_after_hard_break_is_dropped() {
        let doc = Doc::new(vec![p(vec![t("a"), Inline::HardBreak, t(" ")])]);
        assert_eq!(serialize(&doc), "a
");
        assert_eq!(parse(&serialize(&doc)), Doc::new(vec![p(vec![t("a")])]));
        let trailing = Doc::new(vec![p(vec![t("a"), Inline::HardBreak, t("  "), Inline::HardBreak])]);
        assert_eq!(parse(&serialize(&trailing)), Doc::new(vec![p(vec![t("a")])]));
    }

    #[test]
    fn roundtrip_formatting() {
        let centered = ParaAttrs { text_align: Some(Align::Center), space_before: Some(24), ..Default::default() };
        let novel = ParaAttrs { indent: Some(1.25), line_height: Some(1.5), space_after: Some(0), ..Default::default() };
        let doc = Doc::new(vec![
            pa(centered, vec![Inline::marked("Capítulo um", Marks::BOLD)]),
            pa(novel, vec![t("Era "), Inline::marked("uma", Marks::ITALIC), t(" vez"), Inline::HardBreak, t("{: não é attr}")]),
            Block::Separator,
            p(vec![t("***")]),
            p(vec![t("![](../imagens/falsa.png)")]),
        ]);
        let md = serialize(&doc);
        assert_eq!(parse(&md), doc, "via {md:?}");
        assert!(md.starts_with("**Capítulo um**\n{: align=center before=24}\n\n"));
    }

    #[test]
    fn plain_chapters_are_byte_identical() {
        let md = "Primeiro\\\nsegunda linha\n\n***\n\n![](../imagens/a.png)\n\n— Então é hoje — murmurou.\n";
        assert_eq!(serialize(&parse(md)), md);
    }

    #[test]
    fn a_lone_attr_line_is_text() {
        assert_eq!(parse("{: align=center}").content, vec![p(vec![t("{: align=center}")])]);
    }
}
