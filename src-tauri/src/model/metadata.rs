use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::storage::paths::CHAPTERS_DIR;

pub const METADATA_VERSION: u32 = 1;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub version: u32,
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub cover: Option<String>,
    #[serde(default)]
    pub updated_at: u64,
    #[serde(default)]
    pub cur: usize,
    #[serde(default)]
    pub separator: Separator,
    #[serde(default)]
    pub header: Option<String>,
    #[serde(default)]
    pub footer: Option<String>,
    #[serde(default)]
    pub chapters: Vec<ChapterEntry>,
    /// Unknown keys survive a read/write cycle.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChapterEntry {
    pub id: String,
    pub file: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub status: Status,
    #[serde(default)]
    pub notes: String,
    #[serde(default)]
    pub words: usize,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    #[default]
    Rascunho,
    Revisao,
    Pronto,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Separator {
    Text { text: String },
    Image { image: String },
}

impl Default for Separator {
    fn default() -> Self {
        Separator::Text { text: "* * *".to_string() }
    }
}

impl Metadata {
    pub fn new(id: String, title: &str, chapters: Vec<ChapterEntry>) -> Self {
        Self {
            version: METADATA_VERSION,
            id,
            title: title.to_string(),
            author: String::new(),
            cover: None,
            updated_at: crate::ids::now_ms(),
            cur: 0,
            separator: Separator::default(),
            header: None,
            footer: None,
            chapters,
            extra: Map::new(),
        }
    }

    pub fn total_words(&self) -> usize {
        self.chapters.iter().map(|c| c.words).sum()
    }
}

impl ChapterEntry {
    pub fn new(id: String) -> Self {
        Self {
            file: format!("{CHAPTERS_DIR}/{id}.md"),
            id,
            title: String::new(),
            status: Status::Rascunho,
            notes: String::new(),
            words: 0,
            extra: Map::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_fields_survive_roundtrip() {
        let json = r#"{"version":1,"id":"a","title":"T","futuro":{"x":1},
            "chapters":[{"id":"c","file":"capitulos/c.md","outro":true}]}"#;
        let meta: Metadata = serde_json::from_str(json).unwrap();
        let back = serde_json::to_value(&meta).unwrap();
        assert_eq!(back["futuro"]["x"], 1);
        assert_eq!(back["chapters"][0]["outro"], true);
        assert_eq!(back["separator"]["type"], "text");
        assert_eq!(back["chapters"][0]["status"], "rascunho");
    }

    #[test]
    fn separator_image_shape() {
        let s: Separator = serde_json::from_str(r#"{"type":"image","image":"imagens/separador.png"}"#).unwrap();
        assert_eq!(s, Separator::Image { image: "imagens/separador.png".into() });
    }
}
