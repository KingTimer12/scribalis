//! The book's tree (`area/area.json`): the Manuscrito with its chapters, then folders, texts,
//! images and attachments.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::{manuscript::MANUSCRIPT_TITLE, metadata::Status};
use crate::error::{AppError, AppResult};

pub const WORKSPACE_VERSION: u32 = 2;
/// Trees written before the Manuscrito existed (chapters lived in `metadata.json`).
pub const LEGACY_WORKSPACE_VERSION: u32 = 1;
const IMAGE_EXTENSIONS: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Workspace {
    pub version: u32,
    #[serde(default)]
    pub items: Vec<Node>,
    /// Unknown keys survive a read/write cycle.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Workspace {
    fn default() -> Self {
        Self { version: WORKSPACE_VERSION, items: Vec::new(), extra: Map::new() }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Manuscript,
    Folder,
    Chapter,
    Text,
    Image,
    File,
}

impl NodeKind {
    pub fn for_extension(ext: &str) -> NodeKind {
        if IMAGE_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()) { NodeKind::Image } else { NodeKind::File }
    }

    /// Kinds that hold children.
    pub fn is_container(self) -> bool {
        matches!(self, NodeKind::Manuscript | NodeKind::Folder)
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Node {
    pub id: String,
    pub kind: NodeKind,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub notes: String,
    /// Chapters: relative to the book folder (`capitulos/…`). Other leaves: relative to `area/`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file: Option<String>,
    /// Chapters only.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<Status>,
    /// Chapters only: words in the chapter file.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub words: Option<usize>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Node>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Node {
    pub fn folder(id: String, title: &str) -> Node {
        Node {
            id,
            kind: NodeKind::Folder,
            title: title.to_string(),
            notes: String::new(),
            file: None,
            status: None,
            words: None,
            children: Vec::new(),
            extra: Map::new(),
        }
    }
    pub fn leaf(id: String, kind: NodeKind, title: &str, file: &str) -> Node {
        Node { file: Some(file.to_string()), kind, ..Node::folder(id, title) }
    }
    /// An empty draft chapter; `file` is relative to the book folder.
    pub fn chapter(id: String, title: &str, file: &str) -> Node {
        Node { status: Some(Status::Rascunho), words: Some(0), ..Node::leaf(id, NodeKind::Chapter, title, file) }
    }
    pub fn manuscript(id: String) -> Node {
        Node { kind: NodeKind::Manuscript, ..Node::folder(id, MANUSCRIPT_TITLE) }
    }
}

fn not_found() -> AppError {
    AppError::msg("Item não encontrado")
}

fn not_a_container() -> AppError {
    AppError::msg("Só dá para guardar itens dentro de pastas")
}

pub fn find<'a>(items: &'a [Node], id: &str) -> Option<&'a Node> {
    items.iter().find_map(|n| if n.id == id { Some(n) } else { find(&n.children, id) })
}

pub fn find_mut<'a>(items: &'a mut [Node], id: &str) -> Option<&'a mut Node> {
    for n in items.iter_mut() {
        if n.id == id {
            return Some(n);
        }
        if let Some(found) = find_mut(&mut n.children, id) {
            return Some(found);
        }
    }
    None
}

pub fn remove(items: &mut Vec<Node>, id: &str) -> Option<Node> {
    if let Some(i) = items.iter().position(|n| n.id == id) {
        return Some(items.remove(i));
    }
    items.iter_mut().find_map(|n| remove(&mut n.children, id))
}

pub fn insert(items: &mut Vec<Node>, parent: Option<&str>, index: usize, node: Node) -> AppResult<()> {
    let list = match parent {
        None => items,
        Some(pid) => {
            let p = find_mut(items, pid).ok_or_else(not_found)?;
            if !p.kind.is_container() {
                return Err(not_a_container());
            }
            &mut p.children
        }
    };
    let at = index.min(list.len());
    list.insert(at, node);
    Ok(())
}

/// Moves `id` under `parent` at `index` (position after taking the node out).
pub fn move_node(items: &mut Vec<Node>, id: &str, parent: Option<&str>, index: usize) -> AppResult<()> {
    let node = find(items, id).ok_or_else(not_found)?;
    if let Some(pid) = parent {
        if pid == id || find(&node.children, pid).is_some() {
            return Err(AppError::msg("Não dá para mover uma pasta para dentro dela mesma"));
        }
        let p = find(items, pid).ok_or_else(not_found)?;
        if !p.kind.is_container() {
            return Err(not_a_container());
        }
    }
    let node = remove(items, id).ok_or_else(not_found)?;
    insert(items, parent, index, node)
}

/// Files of a node and all its descendants, with the kind that says how to resolve each path.
pub fn subtree_files(node: &Node) -> Vec<(NodeKind, String)> {
    let mut out: Vec<(NodeKind, String)> = node.file.iter().map(|f| (node.kind, f.clone())).collect();
    for c in &node.children {
        out.extend(subtree_files(c));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree() -> Vec<Node> {
        let mut a = Node::folder("a".into(), "Pesquisa");
        a.children = vec![
            Node::leaf("b".into(), NodeKind::Text, "Ana", "b.md"),
            Node::leaf("c".into(), NodeKind::Image, "Mapa", "arquivos/c.png"),
        ];
        let mut d = Node::folder("d".into(), "Lugares");
        d.children = vec![Node::folder("e".into(), "Vael")];
        vec![a, d, Node::leaf("f".into(), NodeKind::File, "Artigo", "arquivos/f.pdf")]
    }

    fn ids(items: &[Node]) -> Vec<&str> {
        items.iter().map(|n| n.id.as_str()).collect()
    }

    #[test]
    fn json_shape_and_unknown_fields_survive() {
        let json = r#"{"version":1,"futuro":true,"items":[
            {"id":"a","kind":"folder","title":"P","notes":"","children":[
                {"id":"b","kind":"text","title":"Ana","notes":"sinopse","file":"b.md","cor":"azul"}]}]}"#;
        let ws: Workspace = serde_json::from_str(json).unwrap();
        assert_eq!(ws.items[0].children[0].notes, "sinopse");
        let back = serde_json::to_value(&ws).unwrap();
        assert_eq!(back["futuro"], true);
        assert_eq!(back["items"][0]["children"][0]["cor"], "azul");
        assert!(back["items"][0].get("file").is_none());
        assert!(back["items"][0].get("status").is_none());
        assert!(back["items"][0]["children"][0].get("children").is_none());
        assert!(back["items"][0]["children"][0].get("words").is_none());
    }

    #[test]
    fn chapter_and_manuscript_json_shape() {
        let mut m = Node::manuscript("m".into());
        m.children = vec![Node::chapter("c".into(), "Início", "capitulos/c.md")];
        let v = serde_json::to_value(&m).unwrap();
        assert_eq!(v["kind"], "manuscript");
        assert_eq!(v["title"], "Manuscrito");
        assert_eq!(v["children"][0]["kind"], "chapter");
        assert_eq!(v["children"][0]["status"], "rascunho");
        assert_eq!(v["children"][0]["words"], 0);
        let back: Node = serde_json::from_value(v).unwrap();
        assert_eq!(back, m);
    }

    #[test]
    fn finds_nested_nodes() {
        let t = tree();
        assert_eq!(find(&t, "e").unwrap().title, "Vael");
        assert!(find(&t, "zz").is_none());
    }

    #[test]
    fn insert_into_folder_and_clamps_index() {
        let mut t = tree();
        insert(&mut t, Some("d"), 99, Node::leaf("g".into(), NodeKind::Text, "Nota", "g.md")).unwrap();
        assert_eq!(ids(&find(&t, "d").unwrap().children), vec!["e", "g"]);
        insert(&mut t, None, 0, Node::folder("h".into(), "Topo")).unwrap();
        assert_eq!(t[0].id, "h");
        assert!(insert(&mut t, Some("b"), 0, Node::folder("i".into(), "x")).is_err());
        assert!(insert(&mut t, Some("zz"), 0, Node::folder("j".into(), "x")).is_err());
    }

    #[test]
    fn the_manuscript_is_a_container() {
        let mut t = vec![Node::manuscript("m".into())];
        insert(&mut t, Some("m"), 0, Node::chapter("c".into(), "", "capitulos/c.md")).unwrap();
        assert_eq!(ids(&t[0].children), vec!["c"]);
        assert!(insert(&mut t, Some("c"), 0, Node::folder("x".into(), "x")).is_err());
    }

    #[test]
    fn move_reorders_and_reparents() {
        let mut t = tree();
        move_node(&mut t, "f", Some("a"), 1).unwrap();
        assert_eq!(ids(&find(&t, "a").unwrap().children), vec!["b", "f", "c"]);
        move_node(&mut t, "a", None, 1).unwrap();
        assert_eq!(ids(&t), vec!["d", "a"]);
    }

    #[test]
    fn move_refuses_cycles_and_missing_nodes() {
        let mut t = tree();
        let err = move_node(&mut t, "d", Some("e"), 0).unwrap_err();
        assert_eq!(err.0, "Não dá para mover uma pasta para dentro dela mesma");
        assert!(move_node(&mut t, "d", Some("d"), 0).is_err());
        assert_eq!(move_node(&mut t, "zz", None, 0).unwrap_err().0, "Item não encontrado");
        // Tree untouched after a refused move.
        assert_eq!(ids(&t), vec!["a", "d", "f"]);
    }

    #[test]
    fn remove_returns_subtree_and_lists_its_files() {
        let mut t = tree();
        let a = remove(&mut t, "a").unwrap();
        assert_eq!(
            subtree_files(&a),
            vec![(NodeKind::Text, "b.md".to_string()), (NodeKind::Image, "arquivos/c.png".to_string())]
        );
        assert_eq!(ids(&t), vec!["d", "f"]);
        assert!(remove(&mut t, "a").is_none());
    }

    #[test]
    fn kind_from_extension() {
        assert_eq!(NodeKind::for_extension("JPG"), NodeKind::Image);
        assert_eq!(NodeKind::for_extension("gif"), NodeKind::Image);
        assert_eq!(NodeKind::for_extension("pdf"), NodeKind::File);
        assert_eq!(NodeKind::for_extension(""), NodeKind::File);
    }
}
