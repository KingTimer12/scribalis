//! Brings a Scrivener project into a book: each chosen binder item becomes a chapter of the
//! Manuscrito (its descendants become subchapters), everything else lands in the rest of the tree.
//! In a new book, a folder whose items were all chosen becomes the Manuscrito itself, keeping its
//! name and its place in the binder.
//! One document in memory at a time.
use std::{collections::HashSet, path::{Path, PathBuf}};

use super::{binder::{BinderItem, ItemKind}, project::Project};
use crate::error::{AppError, AppResult};
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::{Block, Doc},
    manuscript::{chapters, chapters_in, manuscript, manuscript_mut, mirror},
    metadata::Metadata,
    workspace::{remove, Node, NodeKind},
};
use crate::ops::{library::{create_book, delete_book}, manuscript::new_chapter};
use crate::storage::{
    chapter_io::delete_at,
    metadata_io::write_metadata,
    workspace_io::{copy_into_area, read_workspace, write_node_doc, write_workspace},
};

pub struct Outcome {
    pub chapters: usize,
    pub items: usize,
    pub warnings: usize,
}

const ATTACHMENTS_TITLE: &str = "Anexos do manuscrito";

struct Ctx<'a> {
    project: &'a Project,
    dir: &'a Path,
    /// Keys of the items that become chapters.
    chapter_items: &'a HashSet<String>,
    /// Key of the folder that becomes the Manuscrito in place, if any.
    manuscript_item: Option<&'a str>,
    /// Chapters inside that Manuscrito, subchapters included.
    in_place_chapters: usize,
    chapters: Vec<Node>,
    attachments: Vec<Node>,
    items: usize,
    warnings: usize,
}

/// Trims a title, falling back to "Sem título" when it's blank.
fn normalize_title(t: &str) -> String {
    let t = t.trim();
    if t.is_empty() { "Sem título".to_string() } else { t.to_string() }
}

fn title_of(item: &BinderItem) -> String {
    normalize_title(&item.title)
}

fn has_text(doc: &Doc) -> bool {
    doc.content.iter().any(|b| !matches!(b, Block::Paragraph { content, .. } if content.is_empty()))
}

/// Media never becomes a chapter (it carries no text), nor does the trash.
fn can_be_chapter(item: &BinderItem) -> bool {
    !matches!(item.kind, ItemKind::Image | ItemKind::File | ItemKind::Trash)
}

impl Ctx<'_> {
    fn text(&mut self, key: &str) -> Doc {
        self.project.text(key).unwrap_or_else(|_| {
            self.warnings += 1;
            Doc::default()
        })
    }

    fn text_node(&mut self, title: &str, notes: String, synopsis: String, doc: &Doc) -> AppResult<Node> {
        let id = new_id();
        let file = format!("{id}.md");
        write_node_doc(self.dir, &file, doc)?;
        let mut node = Node::leaf(id, NodeKind::Text, title, &file);
        node.notes = notes;
        node.synopsis = synopsis;
        self.items += 1;
        Ok(node)
    }

    fn media_node(&mut self, item: &BinderItem) -> AppResult<Option<Node>> {
        let Some(src) = self.project.content(&item.key) else {
            self.warnings += 1;
            return Ok(None);
        };
        let id = new_id();
        let (rel, kind) = copy_into_area(self.dir, &src, &id)?;
        let mut node = Node::leaf(id, kind, &title_of(item), &rel);
        node.notes = self.project.notes(&item.key);
        node.synopsis = self.project.synopsis(&item.key);
        self.items += 1;
        Ok(Some(node))
    }

    /// Appends the workspace nodes of `item`'s children onto `parent` (a folder or a document).
    fn push_children(&mut self, parent: &mut Node, item: &BinderItem) -> AppResult<()> {
        for child in &item.children {
            if let Some(n) = self.node(child)? {
                parent.children.push(n);
            }
        }
        Ok(())
    }

    /// Workspace node for an item that is not a chapter (None = skipped or taken as chapter).
    fn node(&mut self, item: &BinderItem) -> AppResult<Option<Node>> {
        if item.kind == ItemKind::Trash {
            return Ok(None);
        }
        if self.manuscript_item == Some(item.key.as_str()) {
            return self.manuscript_node(item).map(Some);
        }
        if self.chapter_items.contains(&item.key) && can_be_chapter(item) {
            self.emit_chapter(item)?;
            return Ok(None);
        }
        match item.kind {
            ItemKind::Image | ItemKind::File if item.children.is_empty() => self.media_node(item),
            ItemKind::Text => {
                // A text with children stays a document; its children become subdocuments.
                let doc = self.text(&item.key);
                let notes = self.project.notes(&item.key);
                let synopsis = self.project.synopsis(&item.key);
                let mut node = self.text_node(&title_of(item), notes, synopsis, &doc)?;
                self.push_children(&mut node, item)?;
                Ok(Some(node))
            }
            ItemKind::Image | ItemKind::File => {
                // Media with children: a folder titled like the item, holding its own
                // media node first (when the file exists) and then its children.
                let mut folder = Node::folder(new_id(), &title_of(item));
                folder.synopsis = self.project.synopsis(&item.key);
                self.items += 1;
                if let Some(media) = self.media_node(item)? {
                    folder.children.push(media);
                }
                self.push_children(&mut folder, item)?;
                Ok(Some(folder))
            }
            _ => {
                let title = title_of(item);
                // The Draft's leftovers must not look like the book's own Manuscrito.
                let folder_title = if item.kind == ItemKind::Draft { format!("{title} (Scrivener)") } else { title.clone() };
                let mut folder = Node::folder(new_id(), &folder_title);
                self.items += 1;
                let doc = self.text(&item.key);
                let notes = self.project.notes(&item.key);
                let synopsis = self.project.synopsis(&item.key);
                folder.synopsis = synopsis.clone();
                let own_text = has_text(&doc);
                if own_text {
                    folder.children.push(self.text_node(&title, notes, synopsis, &doc)?);
                } else {
                    folder.notes = notes;
                }
                self.push_children(&mut folder, item)?;
                if !own_text
                    && folder.children.is_empty()
                    && !item.children.is_empty()
                    && folder.notes.is_empty()
                    && folder.synopsis.is_empty()
                {
                    // Every child became a chapter (e.g. the manuscript): an empty shell is just noise.
                    self.items -= 1;
                    return Ok(None);
                }
                Ok(Some(folder))
            }
        }
    }

    /// Chapter nodes for `item`, pushed onto `out`: the item with its own text, notes and
    /// synopsis, and its descendants as subchapters in binder order. Media cannot enter the
    /// Manuscrito: they go to the attachments and their children take their place.
    fn chapter_nodes(&mut self, item: &BinderItem, out: &mut Vec<Node>) -> AppResult<()> {
        if item.kind == ItemKind::Trash {
            return Ok(());
        }
        if matches!(item.kind, ItemKind::Image | ItemKind::File) {
            if let Some(n) = self.media_node(item)? {
                self.attachments.push(n);
            }
            for child in &item.children {
                self.chapter_nodes(child, out)?;
            }
            return Ok(());
        }
        let doc = self.text(&item.key);
        let mut node = new_chapter(self.dir, &title_of(item), &doc)?;
        node.notes = self.project.notes(&item.key);
        node.synopsis = self.project.synopsis(&item.key);
        for child in &item.children {
            self.chapter_nodes(child, &mut node.children)?;
        }
        out.push(node);
        Ok(())
    }

    /// The folder whose items were all chosen, as the Manuscrito: same name, notes and synopsis,
    /// its own text (if any) as the opening chapter, then each item as a chapter.
    fn manuscript_node(&mut self, item: &BinderItem) -> AppResult<Node> {
        let title = title_of(item);
        let mut m = Node::manuscript(new_id());
        m.title = title.clone();
        m.notes = self.project.notes(&item.key);
        m.synopsis = self.project.synopsis(&item.key);
        let doc = self.text(&item.key);
        if has_text(&doc) {
            m.children.push(new_chapter(self.dir, &title, &doc)?);
        }
        for child in &item.children {
            self.chapter_nodes(child, &mut m.children)?;
        }
        self.in_place_chapters = m.children.iter().map(chapters_in).sum();
        Ok(m)
    }

    /// A chapter of the Manuscrito from `item`, with its descendants as subchapters.
    fn emit_chapter(&mut self, item: &BinderItem) -> AppResult<()> {
        let mut out = Vec::new();
        self.chapter_nodes(item, &mut out)?;
        self.chapters.extend(out);
        Ok(())
    }
}

/// The folder marked as the chapter folder: every chosen item is one of its direct children, and
/// every item of it that can be a chapter is chosen ("marcar itens"). In a new book it becomes the
/// Manuscrito in place. Chosen items spread over several places name no folder.
pub fn chapter_folder<'a>(items: &'a [BinderItem], chosen: &HashSet<String>) -> Option<&'a BinderItem> {
    fn parent_of<'a>(items: &'a [BinderItem], key: &str) -> Option<&'a BinderItem> {
        items.iter().find_map(|i| if i.children.iter().any(|c| c.key == key) { Some(i) } else { parent_of(&i.children, key) })
    }
    let first = chosen.iter().next()?;
    let folder = parent_of(items, first)?;
    if !matches!(folder.kind, ItemKind::Draft | ItemKind::Folder | ItemKind::Research) {
        return None;
    }
    let eligible: Vec<&BinderItem> = folder.children.iter().filter(|c| can_be_chapter(c)).collect();
    let all_chosen = eligible.iter().all(|c| chosen.contains(&c.key));
    let only_these = chosen.iter().all(|k| eligible.iter().any(|c| &c.key == k));
    (all_chosen && only_these).then_some(folder)
}

/// Imports into an existing (v2) book: chapters go to the end of the Manuscrito, in binder
/// order; the other items go into a new folder named `wrap` (or the root when `None`).
pub fn import_into(
    project: &Project,
    chapter_items: &HashSet<String>,
    dir: &Path,
    meta: &mut Metadata,
    wrap: Option<&str>,
) -> AppResult<Outcome> {
    import(project, chapter_items, dir, meta, wrap, false)
}

/// `in_place`: a folder whose items were all chosen replaces the book's Manuscrito, where it sits
/// in the binder and with its name (new books only: an existing book keeps its own Manuscrito).
fn import(
    project: &Project,
    chapter_items: &HashSet<String>,
    dir: &Path,
    meta: &mut Metadata,
    wrap: Option<&str>,
    in_place: bool,
) -> AppResult<Outcome> {
    let binder = project.binder()?;
    let manuscript_item = if in_place { chapter_folder(&binder, chapter_items).map(|i| i.key.as_str()) } else { None };
    let mut ctx = Ctx {
        project,
        dir,
        chapter_items,
        manuscript_item,
        in_place_chapters: 0,
        chapters: Vec::new(),
        attachments: Vec::new(),
        items: 0,
        warnings: 0,
    };
    let mut nodes = Vec::new();
    for item in &binder {
        if let Some(n) = ctx.node(item)? {
            nodes.push(n);
        }
    }
    if !ctx.attachments.is_empty() {
        let mut folder = Node::folder(new_id(), ATTACHMENTS_TITLE);
        folder.children = std::mem::take(&mut ctx.attachments);
        ctx.items += 1;
        nodes.push(folder);
    }
    let mut ws = read_workspace(dir)?;
    if ctx.in_place_chapters > 0 {
        // The new book's own Manuscrito (with its empty starter chapter) gives way.
        if let Some(old) = manuscript(&ws.items).map(|m| m.id.clone()) {
            remove(&mut ws.items, &old);
        }
    }
    if !nodes.is_empty() {
        match wrap {
            Some(title) => {
                let mut folder = Node::folder(new_id(), &normalize_title(title));
                folder.children = nodes;
                ws.items.push(folder);
            }
            None => ws.items.extend(nodes),
        }
    }
    // Subchapters count too: the summary tells how many chapters the Manuscrito gained.
    let outside: usize = ctx.chapters.iter().map(chapters_in).sum();
    if outside > 0 {
        let m = manuscript_mut(&mut ws.items).ok_or_else(|| AppError::msg("Obra sem Manuscrito"))?;
        m.children.extend(ctx.chapters);
    }
    write_workspace(dir, &ws)?;
    meta.chapters = mirror(&ws.items);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    Ok(Outcome { chapters: outside + ctx.in_place_chapters, items: ctx.items, warnings: ctx.warnings })
}

/// Creates a book named after the project and imports into it; if anything fails after
/// the folder is created, it's removed so no half-built ("ghost") book is left under `root`.
pub fn import_new_book(root: &Path, project: &Project, chapter_items: &HashSet<String>) -> AppResult<(PathBuf, Metadata, Outcome)> {
    let (dir, mut meta) = create_book(root, &project.title)?;
    match fill_new_book(project, chapter_items, &dir, &mut meta) {
        Ok(outcome) => Ok((dir, meta, outcome)),
        Err(e) => {
            if let Err(cleanup_err) = delete_book(&dir) {
                eprintln!("could not remove failed import's book folder {}: {cleanup_err}", dir.display());
            }
            Err(e)
        }
    }
}

fn fill_new_book(project: &Project, chapter_items: &HashSet<String>, dir: &Path, meta: &mut Metadata) -> AppResult<Outcome> {
    let starter = chapters(&read_workspace(dir)?.items).first().map(|c| (*c).clone());
    let outcome = import(project, chapter_items, dir, meta, None, true)?;
    // Imported chapters replace the empty starter (already gone with its Manuscrito when a folder
    // took its place); with none, it stays so the book is valid.
    if let (Some(starter), true) = (starter, outcome.chapters > 0) {
        let mut ws = read_workspace(dir)?;
        remove(&mut ws.items, &starter.id);
        meta.open = chapters(&ws.items).first().map(|c| c.id.clone());
        meta.chapters = mirror(&ws.items);
        write_workspace(dir, &ws)?;
        write_metadata(dir, meta)?;
        if let Some(file) = &starter.file {
            delete_at(dir, file)?;
        }
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::model::doc::Block;
    use crate::model::manuscript::chapters;
    use crate::model::workspace::NodeKind;
    use crate::ops::library::create_book;
    use crate::storage::{chapter_io::read_at, workspace_io::read_workspace};
    use crate::text::words::doc_text;

    /// Chapters of a book in reading order, as (title, notes, file).
    fn chapter_list(dir: &Path) -> Vec<(String, String, String)> {
        chapters(&read_workspace(dir).unwrap().items)
            .iter()
            .map(|c| (c.title.clone(), c.notes.clone(), c.file.clone().unwrap()))
            .collect()
    }

    const BINDER: &str = r#"<ScrivenerProject><Binder>
      <BinderItem UUID="D" Type="DraftFolder"><Title>Manuscrito</Title><Children>
        <BinderItem UUID="C1" Type="Folder"><Title>Capítulo 1</Title><Children>
          <BinderItem UUID="S1" Type="Text"><Title>Cena 1</Title></BinderItem>
          <BinderItem UUID="S2" Type="Text"><Title>Cena 2</Title></BinderItem>
          <BinderItem UUID="IMG" Type="Image"><Title>Esboço</Title></BinderItem>
        </Children></BinderItem>
        <BinderItem UUID="C2" Type="Text"><Title>Capítulo 2</Title></BinderItem>
      </Children></BinderItem>
      <BinderItem UUID="R" Type="ResearchFolder"><Title>Pesquisa</Title><Children>
        <BinderItem UUID="N1" Type="Text"><Title>Ana</Title></BinderItem>
        <BinderItem UUID="PDF" Type="PDF"><Title>Artigo</Title></BinderItem>
        <BinderItem UUID="GONE" Type="Image"><Title>Sumiu</Title></BinderItem>
      </Children></BinderItem>
      <BinderItem UUID="T" Type="TrashFolder"><Title>Lixeira</Title><Children>
        <BinderItem UUID="X" Type="Text"><Title>Apagado</Title></BinderItem></Children></BinderItem>
    </Binder></ScrivenerProject>"#;

    fn project(root: &Path) -> Project {
        let dir = root.join("Livro.scriv");
        let data = dir.join("Files/Data");
        let put = |key: &str, name: &str, body: &[u8]| {
            fs::create_dir_all(data.join(key)).unwrap();
            fs::write(data.join(key).join(name), body).unwrap();
        };
        fs::create_dir_all(&data).unwrap();
        fs::write(dir.join("Livro.scrivx"), BINDER).unwrap();
        put("S1", "content.rtf", br"{\rtf1 Primeira {\b cena}.\par}");
        put("S1", "synopsis.txt", b"Abertura");
        put("C1", "synopsis.txt", "Chegada ao porto".as_bytes());
        put("N1", "synopsis.txt", "A heroína".as_bytes());
        put("S2", "content.rtf", br"{\rtf1 Segunda cena.\par}");
        put("C2", "content.rtf", br"{\rtf1\qc Fim\par}");
        put("N1", "content.rtf", br"{\rtf1 Olhos cinzentos.\par}");
        put("N1", "notes.rtf", br"{\rtf1 Protagonista\par}");
        put("IMG", "content.png", b"png");
        put("PDF", "content.pdf", b"%PDF");
        Project::open(&dir).unwrap()
    }

    fn folders(keys: &[&str]) -> HashSet<String> {
        keys.iter().map(|k| k.to_string()).collect()
    }

    /// Header Scrivener 3 writes on macOS: font, color and style tables before the text.
    const SCRIV3_HEADER: &str = r"{\rtf1\ansi\ansicpg1252\cocoartf2761
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fnil\fcharset0 Palatino-Roman;\f1\fnil\fcharset0 Palatino-Italic;}
{\colortbl;\red255\green255\blue255;\red0\green0\blue0;}
{\*\expandedcolortbl;;\cssrgb\c0\c0\c0;}
{\stylesheet{\s0\qc\b\f0\fs28 Heading;}{\s1\qj\i Body;}}
\pard\tx360\tx720\sl264\slmult1\pardirnatural\partightenfactor0
\f0\fs26 \cf2 ";

    #[test]
    fn realistic_scrivener3_project_imports_clean_text() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Saga.scriv");
        let data = dir.join("Files/Data");
        let binder = r#"<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Version="2.0"><Binder>
  <BinderItem UUID="D" Type="DraftFolder" Created="x"><Title>Manuscrito</Title><Children>
    <BinderItem UUID="P1" Type="Folder"><Title>Parte I &amp; II</Title><Children>
      <BinderItem UUID="A" Type="Text"><Title>Chegada</Title><MetaData/></BinderItem>
      <BinderItem UUID="B" Type="Text"><Title>Vazio</Title></BinderItem>
    </Children></BinderItem>
  </Children></BinderItem>
  <BinderItem UUID="R" Type="ResearchFolder"><Title>Pesquisa</Title><Children>
    <BinderItem UUID="F" Type="Folder"><Title>Lugares</Title><Children>
      <BinderItem UUID="L" Type="Text"><Title>Porto de Ilen</Title></BinderItem>
    </Children></BinderItem>
  </Children></BinderItem>
</Binder></ScrivenerProject>"#;
        fs::create_dir_all(data.join("A")).unwrap();
        fs::create_dir_all(data.join("L")).unwrap();
        fs::write(dir.join("Saga.scrivx"), binder).unwrap();
        // Unicode escapes built from arguments: "\u" plus four digits typed literally gets rewritten by tooling.
        let a = format!(
            r"{SCRIV3_HEADER}Ela chegou \'e0 cidade \uc0\u{}  cansada.\
\
\f1\i Ningu\'e9m\f0\i0  a esperava.}}",
            8212
        );
        fs::write(data.join("A/content.rtf"), a).unwrap();
        let l = format!(r"{SCRIV3_HEADER}Cora\uc0\u{} \u{}o do porto \u{}\u{} .}}", 231, 227, 55357, 56832);
        fs::write(data.join("L/content.rtf"), l).unwrap();
        let project = Project::open(&dir).unwrap();

        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (book, _meta, out) = import_new_book(&root, &project, &folders(&["P1"])).unwrap();
        // "Vazio" has no content.rtf: an empty scene, not a warning.
        assert_eq!((out.chapters, out.warnings), (3, 0));
        let list = chapter_list(&book);
        let titles: Vec<&str> = list.iter().map(|c| c.0.as_str()).collect();
        assert_eq!(titles, vec!["Parte I & II", "Chegada", "Vazio"]);
        let doc = read_at(&book, &list[1].2).unwrap();
        let text = doc_text(&doc);
        assert!(text.starts_with("Ela chegou à cidade — cansada."), "{text:?}");
        assert!(text.contains("Ninguém a esperava."), "{text:?}");
        for word in ["Palatino", "Heading", "Body", "cssrgb"] {
            assert!(!text.contains(word), "table leaked into text: {text:?}");
        }
        // The stylesheet's \qc belongs to a style definition, not to the paragraphs.
        let Block::Paragraph { attrs, .. } = &doc.content[0] else { panic!("{:?}", doc.content[0]) };
        assert_eq!(attrs.text_align, None);

        let ws = read_workspace(&book).unwrap();
        let place = &ws.items[1].children[0].children[0];
        assert_eq!(place.title, "Porto de Ilen");
        let place_doc = crate::storage::workspace_io::read_node_doc(&book, place.file.as_deref().unwrap()).unwrap();
        assert!(doc_text(&place_doc).starts_with("Coração do porto"), "{:?}", doc_text(&place_doc));
    }

    #[test]
    fn new_book_gets_chapters_and_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, meta, out) = import_new_book(&root, &p, &folders(&["C1", "C2"])).unwrap();
        assert_eq!(meta.title, "Livro");
        assert_eq!((out.chapters, out.warnings), (4, 1));
        let list = chapter_list(&dir);
        // The imported chapters replace the empty starter; the scenes are subchapters.
        let titles: Vec<&str> = list.iter().map(|c| c.0.as_str()).collect();
        assert_eq!(titles, vec!["Capítulo 1", "Cena 1", "Cena 2", "Capítulo 2"]);
        assert_eq!(doc_text(&read_at(&dir, &list[0].2).unwrap()), "");
        assert_eq!(doc_text(&read_at(&dir, &list[1].2).unwrap()), "Primeira cena.");
        assert_eq!(doc_text(&read_at(&dir, &list[2].2).unwrap()), "Segunda cena.");
        let ws = read_workspace(&dir).unwrap();
        let c1 = &ws.items[0].children[0];
        let scenes: Vec<(&str, NodeKind)> = c1.children.iter().map(|n| (n.title.as_str(), n.kind)).collect();
        assert_eq!(scenes, vec![("Cena 1", NodeKind::Chapter), ("Cena 2", NodeKind::Chapter)]);
        // Each scene keeps its own synopsis, in its own field.
        assert_eq!((c1.children[0].synopsis.as_str(), c1.children[0].notes.as_str()), ("Abertura", ""));
        assert_eq!(meta.open.as_deref(), Some(chapters(&ws.items)[0].id.as_str()));
        // The metadata mirror lists exactly the imported chapters, starter gone.
        assert_eq!(meta.chapters, crate::model::manuscript::mirror(&ws.items));
        let titles: Vec<&str> = ws.items.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(titles, vec!["Manuscrito", "Pesquisa", "Anexos do manuscrito"]);
        assert_eq!(ws.items[0].kind, NodeKind::Manuscript);
        let research = &ws.items[1];
        assert_eq!(research.children.len(), 2); // "Sumiu" has no file: warning, no node
        assert_eq!((research.children[0].kind, research.children[0].notes.as_str()), (NodeKind::Text, "Protagonista"));
        assert_eq!(chapters(&ws.items)[0].synopsis, "Chegada ao porto");
        assert_eq!(research.children[0].synopsis, "A heroína");
        assert_eq!(research.children[1].kind, NodeKind::File);
        assert_eq!(ws.items[2].children[0].kind, NodeKind::Image);
        assert!(!ws.items.iter().any(|n| n.title == "Lixeira"));
    }

    #[test]
    fn a_text_with_children_stays_a_document_with_subdocuments() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Sub.scriv");
        let data = dir.join("Files/Data");
        for key in ["A", "B", "C"] {
            fs::create_dir_all(data.join(key)).unwrap();
        }
        fs::write(dir.join("Sub.scrivx"), r#"<ScrivenerProject><Binder>
          <BinderItem UUID="R" Type="ResearchFolder"><Title>Pesquisa</Title><Children>
            <BinderItem UUID="A" Type="Text"><Title>Ana</Title><Children>
              <BinderItem UUID="B" Type="Text"><Title>Infância</Title><Children>
                <BinderItem UUID="C" Type="Text"><Title>Escola</Title></BinderItem>
              </Children></BinderItem>
            </Children></BinderItem>
          </Children></BinderItem>
        </Binder></ScrivenerProject>"#).unwrap();
        fs::write(data.join("A/content.rtf"), br"{\rtf1 Olhos cinzentos.\par}").unwrap();
        fs::write(data.join("A/synopsis.txt"), "A heroína").unwrap();
        fs::write(data.join("B/content.rtf"), br"{\rtf1 Cresceu no porto.\par}").unwrap();
        let p = Project::open(&dir).unwrap();
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (book, _meta, _out) = import_new_book(&root, &p, &HashSet::new()).unwrap();
        let ws = read_workspace(&book).unwrap();
        let ana = &ws.items[1].children[0];
        assert_eq!((ana.kind, ana.title.as_str(), ana.synopsis.as_str()), (NodeKind::Text, "Ana", "A heroína"));
        let doc = crate::storage::workspace_io::read_node_doc(&book, ana.file.as_deref().unwrap()).unwrap();
        assert_eq!(doc_text(&doc), "Olhos cinzentos.");
        let infancia = &ana.children[0];
        assert_eq!((infancia.kind, infancia.title.as_str()), (NodeKind::Text, "Infância"));
        assert_eq!(ana.children.len(), 1);
        assert_eq!((infancia.children[0].kind, infancia.children[0].title.as_str()), (NodeKind::Text, "Escola"));
    }

    #[test]
    fn open_book_appends_chapters_and_wraps_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let (dir, mut meta) = create_book(tmp.path(), "Minha").unwrap();
        let out = import_into(&p, &folders(&["C1", "C2"]), &dir, &mut meta, Some("Livro")).unwrap();
        assert_eq!(out.chapters, 4);
        let list = chapter_list(&dir);
        assert_eq!(list.len(), 5);
        assert_eq!((list[1].0.as_str(), list[4].0.as_str()), ("Capítulo 1", "Capítulo 2"));
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items.len(), 2);
        assert_eq!(ws.items[1].title, "Livro");
        assert_eq!(ws.items[1].children[0].title, "Pesquisa");
        assert_eq!(meta.chapters.len(), 5);
    }

    #[test]
    fn wrap_title_is_trimmed_and_falls_back_when_blank() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let (dir, mut meta) = create_book(tmp.path(), "Minha").unwrap();
        import_into(&p, &folders(&["C1", "C2"]), &dir, &mut meta, Some("  Livro  ")).unwrap();
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items[1].title, "Livro");

        let (dir2, mut meta2) = create_book(tmp.path(), "Outra").unwrap();
        import_into(&p, &folders(&["C1", "C2"]), &dir2, &mut meta2, Some("   ")).unwrap();
        let ws2 = read_workspace(&dir2).unwrap();
        assert_eq!(ws2.items[1].title, "Sem título");
    }

    #[test]
    fn failed_import_leaves_no_ghost_book() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        // Corrupt the binder after `Project::open` already located the scrivx file, so
        // `create_book` succeeds and only reading the binder inside `import_into` fails.
        fs::write(&p.scrivx, "<ScrivenerProject><Binder><BinderItem").unwrap();
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        assert!(import_new_book(&root, &p, &folders(&["C1", "C2"])).is_err());
        assert!(fs::read_dir(&root).unwrap().next().is_none());
    }

    #[test]
    fn media_with_children_becomes_a_folder_with_itself_and_its_children() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Mapas.scriv");
        let data = dir.join("Files/Data");
        fs::create_dir_all(data.join("M")).unwrap();
        fs::create_dir_all(data.join("T1")).unwrap();
        fs::write(dir.join("Mapas.scrivx"), r#"<ScrivenerProject><Binder>
          <BinderItem UUID="R" Type="ResearchFolder"><Title>Pesquisa</Title><Children>
            <BinderItem UUID="M" Type="Image"><Title>Mapa</Title><Children>
              <BinderItem UUID="T1" Type="Text"><Title>Nota</Title></BinderItem>
            </Children></BinderItem>
          </Children></BinderItem>
        </Binder></ScrivenerProject>"#).unwrap();
        fs::write(data.join("M").join("content.png"), b"png").unwrap();
        fs::write(data.join("T1").join("content.rtf"), br"{\rtf1 Nota do mapa.\par}").unwrap();
        let p = Project::open(&dir).unwrap();

        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (book_dir, _meta, _out) = import_new_book(&root, &p, &HashSet::new()).unwrap();
        let ws = read_workspace(&book_dir).unwrap();
        let pesquisa = &ws.items[1];
        assert_eq!(pesquisa.title, "Pesquisa");
        let mapa = &pesquisa.children[0];
        assert_eq!((mapa.kind, mapa.title.as_str()), (NodeKind::Folder, "Mapa"));
        assert_eq!(mapa.children.len(), 2);
        assert_eq!((mapa.children[0].kind, mapa.children[0].title.as_str()), (NodeKind::Image, "Mapa"));
        assert_eq!((mapa.children[1].kind, mapa.children[1].title.as_str()), (NodeKind::Text, "Nota"));
    }

    #[test]
    fn media_inside_a_chapter_goes_to_attachments_and_its_children_stay_subchapters() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Foto.scriv");
        let data = dir.join("Files/Data");
        for key in ["S1", "IMG2", "S3"] {
            fs::create_dir_all(data.join(key)).unwrap();
        }
        fs::write(dir.join("Foto.scrivx"), r#"<ScrivenerProject><Binder>
          <BinderItem UUID="D" Type="DraftFolder"><Title>Manuscrito</Title><Children>
            <BinderItem UUID="C1" Type="Folder"><Title>Capítulo 1</Title><Children>
              <BinderItem UUID="S1" Type="Text"><Title>Cena 1</Title></BinderItem>
              <BinderItem UUID="IMG2" Type="Image"><Title>Foto</Title><Children>
                <BinderItem UUID="S3" Type="Text"><Title>Legenda</Title></BinderItem>
              </Children></BinderItem>
            </Children></BinderItem>
          </Children></BinderItem>
        </Binder></ScrivenerProject>"#).unwrap();
        fs::write(data.join("S1").join("content.rtf"), br"{\rtf1 Primeira cena.\par}").unwrap();
        fs::write(data.join("IMG2").join("content.png"), b"png").unwrap();
        fs::write(data.join("S3").join("content.rtf"), br"{\rtf1 Texto da legenda.\par}").unwrap();
        let p = Project::open(&dir).unwrap();

        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (book_dir, _meta, out) = import_new_book(&root, &p, &folders(&["C1"])).unwrap();
        assert_eq!(out.chapters, 3);
        let list = chapter_list(&book_dir);
        let titles: Vec<&str> = list.iter().map(|c| c.0.as_str()).collect();
        assert_eq!(titles, vec!["Capítulo 1", "Cena 1", "Legenda"]);
        assert_eq!(doc_text(&read_at(&book_dir, &list[2].2).unwrap()), "Texto da legenda.");
        // The caption takes the photo's place under the chapter.
        assert_eq!(read_workspace(&book_dir).unwrap().items[0].children[0].children.len(), 2);
        let ws = read_workspace(&book_dir).unwrap();
        assert_eq!(ws.items[1].title, "Anexos do manuscrito");
        assert_eq!((ws.items[1].children[0].kind, ws.items[1].children[0].title.as_str()), (NodeKind::Image, "Foto"));
    }

    #[test]
    fn only_the_chosen_items_become_chapters() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        // One scene alone, and a research text: the rest of the manuscript stays in the workspace.
        let (dir, _meta, out) = import_new_book(&root, &p, &folders(&["S2", "N1"])).unwrap();
        assert_eq!(out.chapters, 2);
        let list = chapter_list(&dir);
        let titles: Vec<&str> = list.iter().map(|c| c.0.as_str()).collect();
        assert_eq!(titles, vec!["Cena 2", "Ana"]);
        assert_eq!(list[1].1, "Protagonista");
        // A chapter from a single item: synopsis in its own field, never in the notes.
        assert_eq!(chapters(&read_workspace(&dir).unwrap().items)[1].synopsis, "A heroína");
        let ws = read_workspace(&dir).unwrap();
        // What was left of the Draft is a plain folder, named so it is not taken for the Manuscrito.
        let leftover = &ws.items[1];
        assert_eq!((leftover.kind, leftover.title.as_str()), (NodeKind::Folder, "Manuscrito (Scrivener)"));
        let chapter1 = &leftover.children[0];
        assert_eq!(chapter1.title, "Capítulo 1");
        assert_eq!(chapter1.synopsis, "Chegada ao porto");
        let left: Vec<&str> = chapter1.children.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(left, vec!["Cena 1", "Esboço"]);
        assert_eq!(leftover.children[1].title, "Capítulo 2");
        let research: Vec<&str> = ws.items[2].children.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(research, vec!["Artigo"]);
    }

    #[test]
    fn media_and_trash_are_never_chapters() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, _meta, out) = import_new_book(&root, &p, &folders(&["IMG", "T", "X"])).unwrap();
        assert_eq!(out.chapters, 0);
        assert_eq!(chapter_list(&dir).len(), 1); // the empty starter stays
    }

    #[test]
    fn nothing_marked_puts_everything_in_the_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, _meta, out) = import_new_book(&root, &p, &HashSet::new()).unwrap();
        assert_eq!(out.chapters, 0);
        // The empty starter chapter stays, so the book is still valid.
        let list = chapter_list(&dir);
        assert_eq!(list.len(), 1);
        assert!(read_at(&dir, &list[0].2).is_ok());
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items[1].title, "Manuscrito (Scrivener)");
        assert_eq!(ws.items[1].children[0].kind, NodeKind::Folder);
    }

    #[test]
    fn the_chapter_folder_becomes_the_manuscrito_where_it_is_and_keeps_its_name() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Lugar.scriv");
        let data = dir.join("Files/Data");
        for key in ["N", "S", "L", "A", "B", "IMG"] {
            fs::create_dir_all(data.join(key)).unwrap();
        }
        fs::write(dir.join("Lugar.scrivx"), r#"<ScrivenerProject><Binder>
          <BinderItem UUID="N" Type="Text"><Title>Notas</Title></BinderItem>
          <BinderItem UUID="S" Type="Folder"><Title>Série</Title><Children>
            <BinderItem UUID="L" Type="Folder"><Title>Livro Um</Title><Children>
              <BinderItem UUID="A" Type="Text"><Title>Abertura</Title></BinderItem>
              <BinderItem UUID="B" Type="Text"><Title>Batalha</Title></BinderItem>
              <BinderItem UUID="IMG" Type="Image"><Title>Mapa</Title></BinderItem>
            </Children></BinderItem>
          </Children></BinderItem>
        </Binder></ScrivenerProject>"#).unwrap();
        fs::write(data.join("A/content.rtf"), br"{\rtf1 Era uma vez.\par}").unwrap();
        fs::write(data.join("L/synopsis.txt"), "O primeiro volume").unwrap();
        fs::write(data.join("IMG/content.png"), b"png").unwrap();
        let p = Project::open(&dir).unwrap();
        let chosen = folders(&["A", "B"]);
        assert_eq!(chapter_folder(&p.binder().unwrap(), &chosen).unwrap().key, "L");
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (book, meta, out) = import_new_book(&root, &p, &chosen).unwrap();
        assert_eq!(out.chapters, 2);
        let ws = read_workspace(&book).unwrap();
        let titles: Vec<&str> = ws.items.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(titles, vec!["Notas", "Série", "Anexos do manuscrito"], "no Manuscrito on top");
        let m = &ws.items[1].children[0];
        assert_eq!((m.kind, m.title.as_str(), m.synopsis.as_str()), (NodeKind::Manuscript, "Livro Um", "O primeiro volume"));
        let list = chapter_list(&book);
        assert_eq!(list.iter().map(|c| c.0.as_str()).collect::<Vec<_>>(), vec!["Abertura", "Batalha"]);
        assert_eq!(doc_text(&read_at(&book, &list[0].2).unwrap()), "Era uma vez.");
        assert_eq!(meta.open.as_deref(), Some(chapters(&ws.items)[0].id.as_str()));
        // The starter chapter left with the starter Manuscrito, file and all.
        assert_eq!(std::fs::read_dir(book.join("capitulos")).unwrap().count(), 2);
    }

    #[test]
    fn chosen_items_from_several_places_keep_the_manuscrito_on_top() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let binder = p.binder().unwrap();
        assert!(chapter_folder(&binder, &folders(&["S2", "N1"])).is_none());
        assert!(chapter_folder(&binder, &folders(&["S1"])).is_none(), "Capítulo 1 has more items");
        assert_eq!(chapter_folder(&binder, &folders(&["C1", "C2"])).unwrap().key, "D");
    }

    #[test]
    fn a_folder_left_empty_keeps_itself_when_it_has_a_synopsis() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Sin.scriv");
        let data = dir.join("Files/Data");
        for key in ["F", "T", "X"] {
            fs::create_dir_all(data.join(key)).unwrap();
        }
        // "Fora" is chosen too, so "Parte" is not the chapter folder: it stays as a plain folder.
        fs::write(dir.join("Sin.scrivx"), r#"<ScrivenerProject><Binder>
          <BinderItem UUID="F" Type="Folder"><Title>Parte</Title><Children>
            <BinderItem UUID="T" Type="Text"><Title>Cena</Title></BinderItem>
          </Children></BinderItem>
          <BinderItem UUID="X" Type="Text"><Title>Fora</Title></BinderItem>
        </Binder></ScrivenerProject>"#).unwrap();
        fs::write(data.join("F/synopsis.txt"), "Onde tudo começa").unwrap();
        fs::write(data.join("T/content.rtf"), br"{\rtf1 Texto.\par}").unwrap();
        let p = Project::open(&dir).unwrap();
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (book, _meta, out) = import_new_book(&root, &p, &folders(&["T", "X"])).unwrap();
        assert_eq!(out.chapters, 2);
        let ws = read_workspace(&book).unwrap();
        assert_eq!((ws.items[1].title.as_str(), ws.items[1].synopsis.as_str()), ("Parte", "Onde tudo começa"));
        assert!(ws.items[1].children.is_empty());
    }

    #[test]
    fn scan_hides_the_trash() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let view = crate::scrivener::scan::scan(&p).unwrap();
        assert_eq!(view.title, "Livro");
        let kinds: Vec<&str> = view.items.iter().map(|i| i.kind.as_str()).collect();
        assert_eq!(kinds, vec!["draft", "research"]);
    }
}
