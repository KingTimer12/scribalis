//! Character marks (bold/italic) applied to inline text runs.
use std::ops::{BitAnd, BitOr, BitXor};

use serde::{ser::SerializeSeq, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

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
