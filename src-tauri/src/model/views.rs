use std::path::Path;

use serde::Serialize;

use crate::storage::paths::safe_join;

use super::{
    manuscript,
    metadata::{Metadata, Separator},
    workspace::Node,
};

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
    /// `items` is the v2 tree (the Manuscrito first).
    pub fn from_tree(dir: &Path, meta: &Metadata, items: &[Node]) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            author: meta.author.clone(),
            cover: meta.cover.as_ref().and_then(|c| safe_join(dir, c).ok()).map(|p| p.to_string_lossy().into_owned()),
            chapters: manuscript::chapters(items).len(),
            words: manuscript::total_words(items),
            ready: manuscript::ready(items),
            updated_at: meta.updated_at,
            cloud: false,
        }
    }
}

/// Book-level fields for the open book; its structure comes separately, as the tree.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BookMeta {
    pub id: String,
    pub title: String,
    pub author: String,
    /// Last opened node (chapter or not).
    pub open: Option<String>,
    pub updated_at: u64,
    /// Absolute book folder; image fields below are relative to it.
    pub dir: String,
    pub cover: Option<String>,
    pub header: Option<String>,
    pub footer: Option<String>,
    pub separator: Separator,
}

impl BookMeta {
    pub fn from_meta(dir: &Path, meta: &Metadata) -> Self {
        Self {
            id: meta.id.clone(),
            title: meta.title.clone(),
            author: meta.author.clone(),
            open: meta.open.clone(),
            updated_at: meta.updated_at,
            dir: dir.to_string_lossy().into_owned(),
            cover: meta.cover.clone(),
            header: meta.header.clone(),
            footer: meta.footer.clone(),
            separator: meta.separator.clone(),
        }
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    /// Position in reading order.
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
    use crate::model::{metadata::Status, workspace::Node};

    #[test]
    fn book_summary_rejects_unsafe_cover_path() {
        let dir = std::path::PathBuf::from("/books/my-book");
        let mut meta = Metadata::new("id1".to_string(), "Test", vec![]);
        meta.cover = Some("../fora.jpg".to_string());
        assert_eq!(BookSummary::from_tree(&dir, &meta, &[]).cover, None, "Should reject .. in cover path");
        meta.cover = Some("/etc/passwd".to_string());
        assert_eq!(BookSummary::from_tree(&dir, &meta, &[]).cover, None, "Should reject absolute cover path");
    }

    #[test]
    fn book_summary_accepts_safe_cover_path() {
        let dir = std::path::PathBuf::from("/books/my-book");
        let mut meta = Metadata::new("id1".to_string(), "Test", vec![]);
        meta.cover = Some("imagens/capa.jpg".to_string());
        let summary = BookSummary::from_tree(&dir, &meta, &[]);
        let cover_path = summary.cover.as_ref().unwrap();
        assert!(cover_path.contains("my-book") && cover_path.contains("capa.jpg"), "got: {}", cover_path);
    }

    #[test]
    fn summary_counts_the_manuscript() {
        let mut done = Node::chapter("c1".into(), "", "capitulos/c1.md");
        done.words = Some(7);
        done.status = Some(Status::Pronto);
        let mut m = Node::manuscript("m".into());
        m.children = vec![done, Node::chapter("c2".into(), "", "capitulos/c2.md")];
        let meta = Metadata::new("id1".into(), "Obra", vec![]);
        let s = BookSummary::from_tree(std::path::Path::new("/x"), &meta, &[m]);
        assert_eq!((s.chapters, s.words, s.ready), (2, 7, 1));
    }

    #[test]
    fn summary_starts_outside_the_cloud() {
        let meta = Metadata::new("id1".into(), "Obra", vec![]);
        let s = BookSummary::from_tree(std::path::Path::new("/x"), &meta, &[]);
        assert!(!s.cloud);
        assert!(serde_json::to_string(&s).unwrap().contains("\"cloud\":false"));
    }
}
