//! Pure rules of the Manuscrito: the one folder of the tree that holds the chapters. The writer
//! names it and places it anywhere among the folders (at the root or inside a folder).

use super::metadata::{ChapterEntry, Status};
use super::workspace::{find, Node, NodeKind};
use crate::error::{AppError, AppResult};

pub const MANUSCRIPT_TITLE: &str = "Manuscrito";
pub const LAST_CHAPTER: &str = "A obra precisa de pelo menos um capítulo";
pub const NO_MEDIA: &str = "Imagens e anexos não entram no Manuscrito";

fn refuse(msg: &str) -> AppResult<()> {
    Err(AppError::msg(msg))
}

/// The Manuscrito, wherever it sits in the tree.
pub fn manuscript(items: &[Node]) -> Option<&Node> {
    items.iter().find_map(|n| if n.kind == NodeKind::Manuscript { Some(n) } else { manuscript(&n.children) })
}

pub fn manuscript_mut(items: &mut [Node]) -> Option<&mut Node> {
    for n in items {
        if n.kind == NodeKind::Manuscript {
            return Some(n);
        }
        if let Some(m) = manuscript_mut(&mut n.children) {
            return Some(m);
        }
    }
    None
}

fn holds_manuscript(node: &Node) -> bool {
    node.kind == NodeKind::Manuscript || node.children.iter().any(holds_manuscript)
}

/// True when `id` is the Manuscrito or sits anywhere inside it.
pub fn in_manuscript(items: &[Node], id: &str) -> bool {
    manuscript(items).is_some_and(|m| m.id == id || find(&m.children, id).is_some())
}

fn collect<'a>(nodes: &'a [Node], out: &mut Vec<&'a Node>) {
    for n in nodes {
        if n.kind == NodeKind::Chapter {
            out.push(n);
        }
        collect(&n.children, out);
    }
}

/// Chapters in reading order: a depth-first walk of the Manuscrito.
pub fn chapters(items: &[Node]) -> Vec<&Node> {
    let mut out = Vec::new();
    if let Some(m) = manuscript(items) {
        collect(&m.children, &mut out);
    }
    out
}

/// A chapter node by id; None for any other kind.
pub fn chapter<'a>(items: &'a [Node], id: &str) -> Option<&'a Node> {
    find(items, id).filter(|n| n.kind == NodeKind::Chapter)
}

/// Position of a chapter in reading order.
pub fn position(items: &[Node], id: &str) -> Option<usize> {
    chapters(items).iter().position(|c| c.id == id)
}

/// The chapter `step` places away from `id` in reading order; None past either end.
pub fn neighbor(items: &[Node], id: &str, step: i32) -> Option<String> {
    let list = chapters(items);
    let at = list.iter().position(|c| c.id == id)? as i64 + i64::from(step);
    usize::try_from(at).ok().and_then(|i| list.get(i)).map(|c| c.id.clone())
}

pub fn total_words(items: &[Node]) -> usize {
    chapters(items).iter().map(|c| c.words.unwrap_or(0)).sum()
}

/// Chapters marked "pronto".
pub fn ready(items: &[Node]) -> usize {
    chapters(items).iter().filter(|c| c.status == Some(Status::Pronto)).count()
}

/// `metadata.chapters` as the cloud server, custom servers and older app versions read it: the
/// chapters in reading order, flat, with the legacy fields. Written, never read back by the app.
pub fn mirror(items: &[Node]) -> Vec<ChapterEntry> {
    chapters(items)
        .into_iter()
        .filter_map(|c| {
            Some(ChapterEntry {
                id: c.id.clone(),
                file: c.file.clone()?,
                title: c.title.clone(),
                status: c.status.unwrap_or_default(),
                notes: c.notes.clone(),
                words: c.words.unwrap_or(0),
                extra: c.extra.clone(),
            })
        })
        .collect()
}

/// Chapters in `node`'s subtree, itself included.
pub fn chapters_in(node: &Node) -> usize {
    usize::from(node.kind == NodeKind::Chapter) + node.children.iter().map(chapters_in).sum::<usize>()
}

fn has_media(node: &Node) -> bool {
    matches!(node.kind, NodeKind::Image | NodeKind::File) || node.children.iter().any(has_media)
}

/// Whether a node placed under `parent` (None = root) ends up inside the Manuscrito.
fn lands_inside(items: &[Node], parent: Option<&str>) -> bool {
    parent.is_some_and(|p| in_manuscript(items, p))
}

/// Taking `node` out of the Manuscrito (move or delete) would leave the book without chapters.
fn takes_every_chapter(items: &[Node], node: &Node) -> bool {
    let inside = chapters_in(node);
    inside > 0 && inside == chapters(items).len()
}

/// A missing id passes: the caller reports "Item não encontrado".
pub fn check_delete(items: &[Node], id: &str) -> AppResult<()> {
    let Some(node) = find(items, id) else { return Ok(()) };
    if node.kind == NodeKind::Manuscript {
        return refuse("O Manuscrito não pode ser excluído");
    }
    if holds_manuscript(node) {
        return refuse("A pasta guarda o Manuscrito, que não pode ser excluído");
    }
    if takes_every_chapter(items, node) {
        return refuse(LAST_CHAPTER);
    }
    Ok(())
}

/// A new node of `kind` under `parent`.
pub fn check_create(items: &[Node], kind: NodeKind, parent: Option<&str>) -> AppResult<()> {
    let inside = lands_inside(items, parent);
    match kind {
        NodeKind::Manuscript => refuse("Item inválido"),
        NodeKind::Chapter if !inside => refuse("Capítulos ficam dentro do Manuscrito"),
        NodeKind::Text if inside => refuse("Textos livres ficam fora do Manuscrito"),
        NodeKind::Image | NodeKind::File if inside => refuse(NO_MEDIA),
        _ => Ok(()),
    }
}

/// Moving `id` under `parent`. A missing id
/// passes: `workspace::move_node` reports it.
pub fn check_move(items: &[Node], id: &str, parent: Option<&str>) -> AppResult<()> {
    let Some(node) = find(items, id) else { return Ok(()) };
    if node.kind == NodeKind::Manuscript {
        // Among the folders only: never inside a document (the cycle check refuses its own subtree).
        let into_document = parent.and_then(|p| find(items, p)).is_some_and(|p| p.kind != NodeKind::Folder);
        return if into_document { refuse("O Manuscrito só fica na raiz ou dentro de pastas") } else { Ok(()) };
    }
    let inside = lands_inside(items, parent);
    if inside && has_media(node) {
        return refuse(NO_MEDIA);
    }
    if !inside && in_manuscript(items, id) && takes_every_chapter(items, node) {
        return refuse(LAST_CHAPTER);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::metadata::Status;
    use crate::model::workspace::{Node, NodeKind};

    fn ch(id: &str, words: usize, status: Status) -> Node {
        let mut n = Node::chapter(id.into(), id, &format!("capitulos/{id}.md"));
        n.words = Some(words);
        n.status = Some(status);
        n
    }

    /// Manuscrito { Parte { c1, c2 }, c3 }, then a folder { text, image } outside.
    fn tree() -> Vec<Node> {
        let mut part = Node::folder("p".into(), "Parte 1");
        part.children = vec![ch("c1", 10, Status::Pronto), ch("c2", 5, Status::Rascunho)];
        let mut m = Node::manuscript("m".into());
        m.children = vec![part, ch("c3", 1, Status::Pronto)];
        let mut f = Node::folder("f".into(), "Pesquisa");
        f.children = vec![
            Node::leaf("t".into(), NodeKind::Text, "Ana", "t.md"),
            Node::leaf("i".into(), NodeKind::Image, "Mapa", "arquivos/i.png"),
        ];
        vec![m, f]
    }

    fn ids(nodes: &[&Node]) -> Vec<String> {
        nodes.iter().map(|n| n.id.clone()).collect()
    }

    #[test]
    fn chapters_follow_a_depth_first_walk() {
        let t = tree();
        assert_eq!(ids(&chapters(&t)), vec!["c1", "c2", "c3"]);
        assert_eq!(position(&t, "c3"), Some(2));
        assert_eq!(position(&t, "t"), None);
        assert_eq!(neighbor(&t, "c2", 1).as_deref(), Some("c3"));
        assert_eq!(neighbor(&t, "c1", -1), None);
        assert_eq!(neighbor(&t, "c3", 1), None);
        assert!(chapter(&t, "c2").is_some());
        assert!(chapter(&t, "t").is_none());
    }

    #[test]
    fn totals_and_membership() {
        let t = tree();
        assert_eq!(total_words(&t), 16);
        assert_eq!(ready(&t), 2);
        assert!(in_manuscript(&t, "m"));
        assert!(in_manuscript(&t, "c1"));
        assert!(!in_manuscript(&t, "t"));
        assert_eq!(chapters_in(&t[0]), 3);
        assert_eq!(manuscript(&t).unwrap().title, MANUSCRIPT_TITLE);
        assert!(manuscript(&t[1..]).is_none());
    }

    #[test]
    fn the_manuscript_is_renamed_and_moved_among_folders_but_never_deleted() {
        let t = tree();
        assert_eq!(check_delete(&t, "m").unwrap_err().0, "O Manuscrito não pode ser excluído");
        assert!(check_move(&t, "m", None).is_ok());
        assert!(check_move(&t, "m", Some("f")).is_ok());
        assert_eq!(check_move(&t, "m", Some("t")).unwrap_err().0, "O Manuscrito só fica na raiz ou dentro de pastas");
        assert!(check_move(&t, "f", None).is_ok(), "anything may stand before it");
        let mut nested = t.clone();
        crate::model::workspace::move_node(&mut nested, "m", Some("f"), 0).unwrap();
        assert_eq!(manuscript(&nested).unwrap().id, "m");
        assert!(in_manuscript(&nested, "c1"));
        assert_eq!(chapters(&nested).len(), 3);
        assert_eq!(check_delete(&nested, "f").unwrap_err().0, "A pasta guarda o Manuscrito, que não pode ser excluído");
    }

    #[test]
    fn only_chapters_and_folders_live_in_the_manuscript() {
        let t = tree();
        assert_eq!(check_move(&t, "i", Some("p")).unwrap_err().0, NO_MEDIA);
        // A folder holding an image cannot go in either.
        assert_eq!(check_move(&t, "f", Some("m")).unwrap_err().0, NO_MEDIA);
        // A text may: it becomes a chapter on the way in.
        assert!(check_move(&t, "t", Some("p")).is_ok());
        assert_eq!(check_create(&t, NodeKind::Image, Some("m")).unwrap_err().0, NO_MEDIA);
        assert_eq!(check_create(&t, NodeKind::Text, Some("p")).unwrap_err().0, "Textos livres ficam fora do Manuscrito");
        assert_eq!(check_create(&t, NodeKind::Chapter, Some("f")).unwrap_err().0, "Capítulos ficam dentro do Manuscrito");
        assert_eq!(check_create(&t, NodeKind::Chapter, None).unwrap_err().0, "Capítulos ficam dentro do Manuscrito");
        assert!(check_create(&t, NodeKind::Chapter, Some("p")).is_ok());
        assert!(check_create(&t, NodeKind::Folder, Some("m")).is_ok());
        assert!(check_create(&t, NodeKind::Manuscript, None).is_err());
    }

    #[test]
    fn last_chapter_cannot_leave() {
        let mut m = Node::manuscript("m".into());
        let mut part = Node::folder("p".into(), "Parte");
        part.children = vec![ch("c1", 0, Status::Rascunho)];
        m.children = vec![part];
        let t = vec![m];
        assert_eq!(check_move(&t, "c1", None).unwrap_err().0, LAST_CHAPTER);
        assert_eq!(check_delete(&t, "c1").unwrap_err().0, LAST_CHAPTER);
        // The folder holding every chapter is refused too.
        assert_eq!(check_delete(&t, "p").unwrap_err().0, LAST_CHAPTER);
        assert_eq!(check_move(&t, "p", None).unwrap_err().0, LAST_CHAPTER);
        // Moving inside the Manuscrito is fine.
        assert!(check_move(&t, "c1", Some("m")).is_ok());
        // With other chapters around, one may leave.
        let t = tree();
        assert!(check_move(&t, "c3", None).is_ok());
        assert!(check_delete(&t, "p").is_ok());
    }

    #[test]
    fn mirror_lists_the_chapters_flat_in_reading_order() {
        let mut t = tree();
        t[0].children[1].extra.insert("cor".into(), serde_json::Value::from("azul"));
        let m = mirror(&t);
        let ids: Vec<&str> = m.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, vec!["c1", "c2", "c3"]);
        assert_eq!((m[0].file.as_str(), m[0].words, m[0].status), ("capitulos/c1.md", 10, Status::Pronto));
        assert_eq!((m[0].title.as_str(), m[0].notes.as_str()), ("c1", ""));
        assert_eq!(m[2].extra["cor"], "azul");
        assert!(mirror(&t[1..]).is_empty());
    }

    #[test]
    fn empty_folders_are_free_in_a_book_without_chapters() {
        let mut m = Node::manuscript("m".into());
        m.children = vec![Node::folder("p".into(), "Parte")];
        let t = vec![m];
        assert!(check_delete(&t, "p").is_ok());
        assert!(check_move(&t, "p", None).is_ok());
    }
}
