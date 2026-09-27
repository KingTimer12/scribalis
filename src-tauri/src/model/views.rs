use std::path::Path;

use serde::Serialize;

use super::metadata::{ChapterEntry, Metadata, Separator, Status};

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookSummary {
    pub id: String,
    pub title: String,
    pub author: String,
    /// Absolute path, ready for `convertFileSrc`.
    pub cover: Option<String>,
    pub chapters: usize,
    pub words: usize,
    pub ready: usize,
    pub updated_at: u64,
}

impl BookSummary {
    pub fn from_meta(dir: &Path, meta: &Metadata) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            author: meta.author.clone(),
            cover: meta.cover.as_ref().map(|c| dir.join(c).to_string_lossy().into_owned()),
            chapters: meta.chapters.len(),
            words: meta.total_words(),
            ready: meta.chapters.iter().filter(|c| c.status == Status::Pronto).count(),
            updated_at: meta.updated_at,
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChapterMeta {
    pub id: String,
    pub title: String,
    pub status: Status,
    pub notes: String,
    pub words: usize,
}

impl From<&ChapterEntry> for ChapterMeta {
    fn from(c: &ChapterEntry) -> Self {
        Self { id: c.id.clone(), title: c.title.clone(), status: c.status, notes: c.notes.clone(), words: c.words }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookMeta {
    pub id: String,
    pub title: String,
    pub author: String,
    pub cur: usize,
    pub updated_at: u64,
    /// Absolute book folder; image fields below are relative to it.
    pub dir: String,
    pub cover: Option<String>,
    pub header: Option<String>,
    pub footer: Option<String>,
    pub separator: Separator,
    pub chapters: Vec<ChapterMeta>,
}

impl BookMeta {
    pub fn from_meta(dir: &Path, meta: &Metadata) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            author: meta.author.clone(),
            cur: meta.cur,
            updated_at: meta.updated_at,
            dir: dir.to_string_lossy().into_owned(),
            cover: meta.cover.clone(),
            header: meta.header.clone(),
            footer: meta.footer.clone(),
            separator: meta.separator.clone(),
            chapters: meta.chapters.iter().map(ChapterMeta::from).collect(),
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub index: usize,
    pub chapter_id: String,
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct LibraryListing {
    pub books: Vec<BookSummary>,
    pub warnings: Vec<String>,
}
