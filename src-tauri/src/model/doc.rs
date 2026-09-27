use std::ops::{BitAnd, BitOr, BitXor};

use serde::{ser::SerializeSeq, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

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
}

impl Inline {
    pub fn text(s: &str) -> Self {
        Inline::Text { text: s.to_string(), marks: Marks::default() }
    }
    pub fn marked(s: &str, marks: Marks) -> Self {
        Inline::Text { text: s.to_string(), marks }
    }
}

/// Character marks the editor supports; serialized as TipTap's `[{"type":"bold"}, …]`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Marks {
    pub bold: bool,
    pub italic: bool,
}

impl Marks {
    pub const BOLD: Marks = Marks { bold: true, italic: false };
    pub const ITALIC: Marks = Marks { bold: false, italic: true };
    pub fn is_empty(&self) -> bool {
        !self.bold && !self.italic
    }
}

impl BitXor for Marks {
    type Output = Marks;
    fn bitxor(self, o: Marks) -> Marks {
        Marks { bold: self.bold ^ o.bold, italic: self.italic ^ o.italic }
    }
}
impl BitAnd for Marks {
    type Output = Marks;
    fn bitand(self, o: Marks) -> Marks {
        Marks { bold: self.bold && o.bold, italic: self.italic && o.italic }
    }
}
impl BitOr for Marks {
    type Output = Marks;
    fn bitor(self, o: Marks) -> Marks {
        Marks { bold: self.bold || o.bold, italic: self.italic || o.italic }
    }
}

impl Serialize for Marks {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        #[derive(Serialize)]
        struct Tag {
            #[serde(rename = "type")]
            kind: &'static str,
        }
        let mut seq = s.serialize_seq(None)?;
        if self.bold { seq.serialize_element(&Tag { kind: "bold" })?; }
        if self.italic { seq.serialize_element(&Tag { kind: "italic" })?; }
        seq.end()
    }
}

impl<'de> Deserialize<'de> for Marks {
    /// Unknown marks (and their attrs) are dropped instead of failing the save.
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let list: Vec<Value> = Deserialize::deserialize(d)?;
        let mut m = Marks::default();
        for v in &list {
            match v.get("type").and_then(Value::as_str) {
                Some("bold") => m.bold = true,
                Some("italic") => m.italic = true,
                _ => {}
            }
        }
        Ok(m)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Align {
    Center,
    Right,
    Justify,
}

impl Align {
    /// `left` (the default) and unknown values are `None`.
    pub fn parse(s: &str) -> Option<Align> {
        match s {
            "center" => Some(Align::Center),
            "right" => Some(Align::Right),
            "justify" => Some(Align::Justify),
            _ => None,
        }
    }
    pub fn as_str(self) -> &'static str {
        match self {
            Align::Center => "center",
            Align::Right => "right",
            Align::Justify => "justify",
        }
    }
}

/// Paragraph formatting; `None` means the app default.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "camelCase", from = "RawParaAttrs")]
pub struct ParaAttrs {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_align: Option<Align>,
    /// Line height multiplier.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f32>,
    /// Points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space_before: Option<u16>,
    /// Points.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub space_after: Option<u16>,
    /// First-line indent in centimeters.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub indent: Option<f32>,
}

fn round2(v: f64) -> f32 {
    ((v * 100.0).round() / 100.0) as f32
}

impl ParaAttrs {
    pub fn is_empty(&self) -> bool {
        *self == ParaAttrs::default()
    }
    pub fn clamp_line(v: f64) -> Option<f32> {
        v.is_finite().then(|| round2(v.clamp(1.0, 3.0)))
    }
    pub fn clamp_before(v: f64) -> Option<u16> {
        // 0 is the default top margin.
        v.is_finite().then(|| v.clamp(0.0, 96.0).round() as u16).filter(|&n| n > 0)
    }
    pub fn clamp_after(v: f64) -> Option<u16> {
        v.is_finite().then(|| v.clamp(0.0, 96.0).round() as u16)
    }
    pub fn clamp_indent(v: f64) -> Option<f32> {
        // No indent is the default.
        v.is_finite().then(|| round2(v.clamp(0.0, 5.0))).filter(|&n| n > 0.0)
    }
}

/// What the webview sends: any field may be null, a string or out of range.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct RawParaAttrs {
    text_align: Value,
    line_height: Value,
    space_before: Value,
    space_after: Value,
    indent: Value,
}

fn num(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

impl From<RawParaAttrs> for ParaAttrs {
    fn from(r: RawParaAttrs) -> Self {
        ParaAttrs {
            text_align: r.text_align.as_str().and_then(Align::parse),
            line_height: num(&r.line_height).and_then(ParaAttrs::clamp_line),
            space_before: num(&r.space_before).and_then(ParaAttrs::clamp_before),
            space_after: num(&r.space_after).and_then(ParaAttrs::clamp_after),
            indent: num(&r.indent).and_then(ParaAttrs::clamp_indent),
        }
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
