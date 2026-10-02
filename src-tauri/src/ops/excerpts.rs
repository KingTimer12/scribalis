//! Card placeholders for a board: the opening lines of each document under a node, so an
//! index card without a synopsis still shows what the document says.
use std::{collections::HashMap, path::Path};

use crate::error::{AppError, AppResult};
use crate::model::workspace::{find, NodeKind};
use crate::storage::workspace_io::{read_doc_at, read_workspace};
use crate::text::excerpt::excerpt;

/// Characters kept per card: about what a large card shows.
const EXCERPT_MAX: usize = 400;

/// Opening text of each chapter or text directly under `parent`, by node id. Documents that
/// are empty or whose file is gone are left out.
pub fn excerpts(dir: &Path, parent: &str) -> AppResult<HashMap<String, String>> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, parent).ok_or_else(|| AppError::msg("Item não encontrado"))?;
    let mut out = HashMap::new();
    for child in &node.children {
        let (NodeKind::Chapter | NodeKind::Text, Some(file)) = (child.kind, &child.file) else { continue };
        let Ok(doc) = read_doc_at(dir, child.kind, file) else { continue };
        let text = excerpt(&doc, EXCERPT_MAX);
        if !text.is_empty() {
            out.insert(child.id.clone(), text);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::Doc;
    use crate::markdown::parse::parse;
    use crate::ops::library::create_book;
    use crate::ops::workspace::{create, tree};
    use crate::storage::workspace_io::write_doc_at;

    #[test]
    fn opening_text_of_each_child_document() {
        let tmp = tempfile::tempdir().unwrap();
        let (dir, _) = create_book(tmp.path(), "Livro").unwrap();
        let folder = create(&dir, None, 9, NodeKind::Folder, "Pasta").unwrap().id;
        let a = create(&dir, Some(&folder), 0, NodeKind::Text, "A").unwrap().id;
        let b = create(&dir, Some(&folder), 1, NodeKind::Text, "B").unwrap().id;
        create(&dir, Some(&folder), 2, NodeKind::Folder, "Sub").unwrap();
        let items = tree(&dir).unwrap();
        let file = find(&items, &a).unwrap().file.clone().unwrap();
        write_doc_at(&dir, NodeKind::Text, &file, &parse("Era uma vez.")).unwrap();
        let file = find(&items, &b).unwrap().file.clone().unwrap();
        write_doc_at(&dir, NodeKind::Text, &file, &Doc::default()).unwrap();
        let got = excerpts(&dir, &folder).unwrap();
        assert_eq!(got.len(), 1);
        assert_eq!(got[&a], "Era uma vez.");
        assert!(excerpts(&dir, "zz").is_err());
    }
}
