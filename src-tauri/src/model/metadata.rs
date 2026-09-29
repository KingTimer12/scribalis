use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[cfg(test)]
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
    /// Legacy (tree v1): index of the open chapter. Read only by the migration.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub cur: usize,
    /// Id of the last opened node (chapter or not).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open: Option<String>,
    #[serde(default)]
    pub separator: Separator,
    #[serde(default)]
    pub header: Option<String>,
    #[serde(default)]
    pub footer: Option<String>,
    /// Tree v1: the chapter list, read only by the migration. Tree v2: a derived mirror of the
    /// Manuscrito (`manuscript::mirror`), written for the cloud server and older app versions.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
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

fn is_zero(n: &usize) -> bool {
    *n == 0
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
            open: None,
            separator: Separator::default(),
            header: None,
            footer: None,
            chapters,
            extra: Map::new(),
        }
    }
}

impl ChapterEntry {
    /// Test fixtures only: the app itself reads entries (migration) or derives them (mirror).
    #[cfg(test)]
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
    #[test]
    fn v2_metadata_omits_the_legacy_fields() {
        let mut meta = Metadata::new("a".into(), "T", vec![]);
        let v = serde_json::to_value(&meta).unwrap();
        assert!(v.get("chapters").is_none() && v.get("cur").is_none() && v.get("open").is_none());
        meta.open = Some("c1".into());
        assert_eq!(serde_json::to_value(&meta).unwrap()["open"], "c1");
    }

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
