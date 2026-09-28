use std::path::Path;

use serde::Serialize;

use crate::storage::paths::safe_join;

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
    /// Has a backup on the current cloud server (filled by the library command).
    pub cloud: bool,
}

impl BookSummary {
    pub fn from_meta(dir: &Path, meta: &Metadata) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            author: meta.author.clone(),
            cover: meta.cover.as_ref().and_then(|c| safe_join(dir, c).ok()).map(|p| p.to_string_lossy().into_owned()),
            chapters: meta.chapters.len(),
            words: meta.total_words(),
            ready: meta.chapters.iter().filter(|c| c.status == Status::Pronto).count(),
            updated_at: meta.updated_at,
            cloud: false,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn book_summary_rejects_unsafe_cover_path() {
        let dir = std::path::PathBuf::from("/books/my-book");
        let mut meta = Metadata::new("id1".to_string(), "Test", vec![]);

        // Escape attempt
        meta.cover = Some("../fora.jpg".to_string());
        let summary = BookSummary::from_meta(&dir, &meta);
        assert_eq!(summary.cover, None, "Should reject .. in cover path");

        // Absolute path attempt
        meta.cover = Some("/etc/passwd".to_string());
        let summary = BookSummary::from_meta(&dir, &meta);
        assert_eq!(summary.cover, None, "Should reject absolute cover path");
    }

    #[test]
    fn book_summary_accepts_safe_cover_path() {
        let dir = std::path::PathBuf::from("/books/my-book");
        let mut meta = Metadata::new("id1".to_string(), "Test", vec![]);

        meta.cover = Some("imagens/capa.jpg".to_string());
        let summary = BookSummary::from_meta(&dir, &meta);
        assert!(summary.cover.is_some(), "Should accept valid cover path");
        let cover_path = summary.cover.as_ref().unwrap();
        assert!(cover_path.contains("my-book") && cover_path.contains("capa.jpg"),
                "Cover path should contain dir and filename, got: {}", cover_path);
    }
}

#[cfg(test)]
mod cloud_flag_tests {
    use super::*;

    #[test]
    fn summary_starts_outside_the_cloud() {
        let meta = Metadata::new("id1".into(), "Obra", vec![]);
        let s = BookSummary::from_meta(std::path::Path::new("/x"), &meta);
        assert!(!s.cloud);
        assert!(serde_json::to_string(&s).unwrap().contains("\"cloud\":false"));
    }
}
