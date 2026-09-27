use serde::{Deserialize, Serialize};

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
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        content: Vec<Inline>,
    },
    Separator,
    Image {
        attrs: ImageAttrs,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct ImageAttrs {
    /// Path relative to the book folder, e.g. `imagens/abc.png`.
    pub src: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Inline {
    Text { text: String },
    HardBreak,
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
        assert_eq!(doc.content[1], Block::Paragraph { content: vec![] });
        assert_eq!(doc.content[2], Block::Separator);
    }

    #[test]
    fn writes_the_shape_the_front_expects() {
        let doc = Doc::new(vec![Block::Separator]);
        assert_eq!(serde_json::to_string(&doc).unwrap(), r#"{"type":"doc","content":[{"type":"separator"}]}"#);
    }
}
