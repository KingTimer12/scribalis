use serde::{Deserialize, Serialize};

pub use crate::model::marks::Marks;
pub use crate::model::para_attrs::{Align, ParaAttrs};

/// ProseMirror/TipTap document, restricted to the editor schema.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Doc {
    #[serde(rename = "type", default = "doc_type")]
    pub kind: String,
    #[serde(default)]
    pub content: Vec<Block>,
}

fn doc_type() -> String {
    "doc".to_string()
}

impl Doc {
    pub fn new(content: Vec<Block>) -> Self {
        Self { kind: doc_type(), content }
    }
}

impl Default for Doc {
    fn default() -> Self {
        Self::new(Vec::new())
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Block {
    Paragraph {
        #[serde(default, skip_serializing_if = "ParaAttrs::is_empty")]
        attrs: ParaAttrs,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        content: Vec<Inline>,
    },
    Separator,
    Image {
        attrs: ImageAttrs,
    },
}

impl Block {
    #[cfg(test)]
    pub fn paragraph(content: Vec<Inline>) -> Self {
        Block::Paragraph { attrs: ParaAttrs::default(), content }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ImageAttrs {
    /// Path relative to the book folder, e.g. `imagens/abc.png`.
    pub src: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Inline {
    Text {
        text: String,
        #[serde(default, skip_serializing_if = "Marks::is_empty")]
        marks: Marks,
    },
    HardBreak,
    /// `@Name` pointing at a sheet (character, place, ability). `label` is the name when it was
    /// written: the editor shows the current one, the label stands in when the sheet is gone.
    Mention {
        attrs: MentionAttrs,
    },
    /// `[[Title]]` pointing at a tree node (chapter, text, folder). An empty `label` shows the
    /// node's current title; a non-empty one is the alias written after `|`.
    WikiLink {
        attrs: WikiLinkAttrs,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct WikiLinkAttrs {
    pub id: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct MentionAttrs {
    pub id: String,
    #[serde(default)]
    pub label: String,
}

impl Inline {
    /// The run as plain text: a line break is a newline, a mention or wiki link its label.
    pub fn plain(&self) -> &str {
        match self {
            Inline::Text { text, .. } => text,
            Inline::HardBreak => "\n",
            Inline::Mention { attrs } => &attrs.label,
            Inline::WikiLink { attrs } => &attrs.label,
        }
    }

    #[cfg(test)]
    pub fn mention(id: &str, label: &str) -> Self {
        Inline::Mention { attrs: MentionAttrs { id: id.into(), label: label.into() } }
    }
    #[cfg(test)]
    pub fn wiki(id: &str, label: &str) -> Self {
        Inline::WikiLink { attrs: WikiLinkAttrs { id: id.into(), label: label.into() } }
    }
    #[cfg(test)]
    pub fn text(s: &str) -> Self {
        Inline::Text { text: s.to_string(), marks: Marks::default() }
    }
    #[cfg(test)]
    pub fn marked(s: &str, marks: Marks) -> Self {
        Inline::Text { text: s.to_string(), marks }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_tiptap_json_and_ignores_unknown_fields() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","attrs":{"x":1},"content":[{"type":"text","text":"Oi","marks":[]},{"type":"hardBreak"}]},
            {"type":"paragraph"},
            {"type":"separator"},
            {"type":"image","attrs":{"src":"imagens/a.png"}}
        ]}"#;
        let doc: Doc = serde_json::from_str(json).unwrap();
        assert_eq!(doc.content.len(), 4);
        assert_eq!(doc.content[1], Block::paragraph(vec![]));
        assert_eq!(doc.content[2], Block::Separator);
    }

    #[test]
    fn writes_the_shape_the_front_expects() {
        let doc = Doc::new(vec![Block::Separator]);
        assert_eq!(serde_json::to_string(&doc).unwrap(), r#"{"type":"doc","content":[{"type":"separator"}]}"#);
    }

    #[test]
    fn reads_marks_and_paragraph_attrs() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","attrs":{"textAlign":"center","lineHeight":1.5,"spaceBefore":12,"spaceAfter":6,"indent":1.25},
             "content":[{"type":"text","text":"Oi","marks":[{"type":"italic"},{"type":"bold"}]}]}
        ]}"#;
        let doc: Doc = serde_json::from_str(json).unwrap();
        let Block::Paragraph { attrs, content } = &doc.content[0] else { panic!() };
        assert_eq!(attrs.text_align, Some(Align::Center));
        assert_eq!(attrs.line_height, Some(1.5));
        assert_eq!((attrs.space_before, attrs.space_after, attrs.indent), (Some(12), Some(6), Some(1.25)));
        assert_eq!(content[0], Inline::marked("Oi", Marks { bold: true, italic: true }));
    }

    #[test]
    fn odd_values_never_fail_and_are_clamped() {
        let json = r#"{"type":"doc","content":[
            {"type":"paragraph","attrs":{"textAlign":"left","lineHeight":"9","spaceBefore":null,"spaceAfter":-4,"indent":0},
             "content":[{"type":"text","text":"x","marks":[{"type":"underline"},{"type":"bold","attrs":{}}]}]},
            {"type":"paragraph","attrs":{"textAlign":"diagonal","lineHeight":0.2,"spaceBefore":500}}
        ]}"#;
        let doc: Doc = serde_json::from_str(json).unwrap();
        let Block::Paragraph { attrs, content } = &doc.content[0] else { panic!() };
        assert_eq!(attrs.text_align, None);
        assert_eq!(attrs.line_height, Some(3.0));
        assert_eq!(attrs.space_before, None);
        assert_eq!(attrs.space_after, Some(0));
        assert_eq!(attrs.indent, None);
        assert_eq!(content[0], Inline::marked("x", Marks::BOLD));
        let Block::Paragraph { attrs, .. } = &doc.content[1] else { panic!() };
        assert_eq!((attrs.text_align, attrs.line_height, attrs.space_before), (None, Some(1.0), Some(96)));
    }

    #[test]
    fn plain_content_serializes_without_marks_or_attrs() {
        let doc = Doc::new(vec![Block::paragraph(vec![Inline::text("a")])]);
        assert_eq!(serde_json::to_string(&doc).unwrap(),
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"a"}]}]}"#);
    }

    #[test]
    fn formatted_content_serializes_the_tiptap_shape() {
        let attrs = ParaAttrs { text_align: Some(Align::Justify), indent: Some(1.25), ..Default::default() };
        let doc = Doc::new(vec![Block::Paragraph { attrs, content: vec![Inline::marked("a", Marks::BOLD | Marks::ITALIC)] }]);
        assert_eq!(serde_json::to_string(&doc).unwrap(),
            r#"{"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":"justify","indent":1.25},"content":[{"type":"text","text":"a","marks":[{"type":"bold"},{"type":"italic"}]}]}]}"#);
    }
}
