//! Brings a Scrivener project into a book: chosen folders become chapters,
//! everything else lands in the workspace. One document in memory at a time.
use std::{collections::HashSet, path::{Path, PathBuf}};

use super::{binder::{BinderItem, ItemKind}, project::Project};
use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::{Block, Doc},
    metadata::{ChapterEntry, Metadata},
    workspace::{Node, NodeKind},
};
use crate::ops::library::{create_book, delete_book};
use crate::storage::{
    chapter_io::{delete_chapter_file, write_chapter},
    metadata_io::write_metadata,
    workspace_io::{copy_into_area, read_workspace, write_node_doc, write_workspace},
};
use crate::text::words::doc_words;

pub struct Outcome {
    pub chapters: usize,
    pub items: usize,
    pub warnings: usize,
}

const ATTACHMENTS_TITLE: &str = "Anexos do manuscrito";

struct Ctx<'a> {
    project: &'a Project,
    dir: &'a Path,
    chapter_folders: &'a HashSet<String>,
    chapters: Vec<ChapterEntry>,
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

fn is_container(item: &BinderItem) -> bool {
    matches!(item.kind, ItemKind::Draft | ItemKind::Research | ItemKind::Folder | ItemKind::Trash)
        || (item.kind == ItemKind::Text && !item.children.is_empty())
}

impl Ctx<'_> {
    fn text(&mut self, key: &str) -> Doc {
        self.project.text(key).unwrap_or_else(|_| {
            self.warnings += 1;
            Doc::default()
        })
    }

    fn text_node(&mut self, title: &str, notes: String, doc: &Doc) -> AppResult<Node> {
        let id = new_id();
        let file = format!("{id}.md");
        write_node_doc(self.dir, &file, doc)?;
        let mut node = Node::leaf(id, NodeKind::Text, title, &file);
        node.notes = notes;
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
        self.items += 1;
        Ok(Some(node))
    }

    /// Appends the workspace nodes of `item`'s children onto `folder`.
    fn push_children(&mut self, folder: &mut Node, item: &BinderItem) -> AppResult<()> {
        for child in &item.children {
            if let Some(n) = self.node(child)? {
                folder.children.push(n);
            }
        }
        Ok(())
    }

    /// Workspace node for an item outside chapter folders (None = skipped).
    fn node(&mut self, item: &BinderItem) -> AppResult<Option<Node>> {
        if item.kind == ItemKind::Trash {
            return Ok(None);
        }
        if self.chapter_folders.contains(&item.key) && is_container(item) {
            self.emit_chapters(item)?;
            return Ok(None);
        }
        match item.kind {
            ItemKind::Image | ItemKind::File if item.children.is_empty() => self.media_node(item),
            ItemKind::Text if item.children.is_empty() => {
                let doc = self.text(&item.key);
                let notes = self.project.notes(&item.key);
                self.text_node(&title_of(item), notes, &doc).map(Some)
            }
            ItemKind::Image | ItemKind::File => {
                // Media with children: a folder titled like the item, holding its own
                // media node first (when the file exists) and then its children.
                let mut folder = Node::folder(new_id(), &title_of(item));
                self.items += 1;
                if let Some(media) = self.media_node(item)? {
                    folder.children.push(media);
                }
                self.push_children(&mut folder, item)?;
                Ok(Some(folder))
            }
            _ => {
                let title = title_of(item);
                let mut folder = Node::folder(new_id(), &title);
                self.items += 1;
                let doc = self.text(&item.key);
                let notes = self.project.notes(&item.key);
                if has_text(&doc) || item.kind == ItemKind::Text {
                    folder.children.push(self.text_node(&title, notes, &doc)?);
                } else {
                    folder.notes = notes;
                }
                self.push_children(&mut folder, item)?;
                Ok(Some(folder))
            }
        }
    }

    /// Depth-first texts and notes under `item` (itself included); media go to attachments.
    fn gather(&mut self, item: &BinderItem, blocks: &mut Vec<Block>, notes: &mut Vec<String>) -> AppResult<()> {
        if item.kind == ItemKind::Trash {
            return Ok(());
        }
        if matches!(item.kind, ItemKind::Image | ItemKind::File) {
            if let Some(n) = self.media_node(item)? {
                self.attachments.push(n);
            }
            // The media itself never contributes chapter text, but its children
            // (if any) are gathered like any other descendant's.
            for child in &item.children {
                self.gather(child, blocks, notes)?;
            }
            return Ok(());
        }
        let doc = self.text(&item.key);
        if has_text(&doc) {
            if !blocks.is_empty() {
                blocks.push(Block::Separator);
            }
            blocks.extend(doc.content);
        }
        let n = self.project.notes(&item.key);
        if !n.is_empty() {
            notes.push(n);
        }
        for child in &item.children {
            self.gather(child, blocks, notes)?;
        }
        Ok(())
    }

    fn emit_chapters(&mut self, folder: &BinderItem) -> AppResult<()> {
        for child in &folder.children {
            if matches!(child.kind, ItemKind::Image | ItemKind::File | ItemKind::Trash) {
                let (mut b, mut n) = (Vec::new(), Vec::new());
                self.gather(child, &mut b, &mut n)?;
                continue;
            }
            let (mut blocks, mut notes) = (Vec::new(), Vec::new());
            self.gather(child, &mut blocks, &mut notes)?;
            let doc = Doc::new(blocks);
            let mut entry = ChapterEntry::new(new_id());
            entry.title = title_of(child);
            entry.notes = notes.join("\n\n");
            entry.words = doc_words(&doc);
            write_chapter(self.dir, &entry, &doc)?;
            self.chapters.push(entry);
        }
        Ok(())
    }
}

/// Imports into an existing book: chapters go after the current ones; workspace
/// items go into a new folder named `wrap` (or the root when `None`).
pub fn import_into(
    project: &Project,
    chapter_folders: &HashSet<String>,
    dir: &Path,
    meta: &mut Metadata,
    wrap: Option<&str>,
) -> AppResult<Outcome> {
    let binder = project.binder()?;
    let mut ctx = Ctx { project, dir, chapter_folders, chapters: Vec::new(), attachments: Vec::new(), items: 0, warnings: 0 };
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
    if !nodes.is_empty() {
        let mut ws = read_workspace(dir)?;
        match wrap {
            Some(title) => {
                let mut folder = Node::folder(new_id(), &normalize_title(title));
                folder.children = nodes;
                ws.items.push(folder);
            }
            None => ws.items.extend(nodes),
        }
        write_workspace(dir, &ws)?;
    }
    let chapters = ctx.chapters.len();
    meta.chapters.extend(ctx.chapters);
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    Ok(Outcome { chapters, items: ctx.items, warnings: ctx.warnings })
}

/// Creates a book named after the project and imports into it; if anything fails after
/// the folder is created, it's removed so no half-built ("ghost") book is left under `root`.
pub fn import_new_book(root: &Path, project: &Project, chapter_folders: &HashSet<String>) -> AppResult<(PathBuf, Metadata, Outcome)> {
    let (dir, mut meta) = create_book(root, &project.title)?;
    match fill_new_book(project, chapter_folders, &dir, &mut meta) {
        Ok(outcome) => Ok((dir, meta, outcome)),
        Err(e) => {
            if let Err(cleanup_err) = delete_book(&dir) {
                eprintln!("could not remove failed import's book folder {}: {cleanup_err}", dir.display());
            }
            Err(e)
        }
    }
}

fn fill_new_book(project: &Project, chapter_folders: &HashSet<String>, dir: &Path, meta: &mut Metadata) -> AppResult<Outcome> {
    let starter = meta.chapters.remove(0);
    let outcome = import_into(project, chapter_folders, dir, meta, None)?;
    if meta.chapters.is_empty() {
        // Nothing became a chapter: keep the empty starter so the book stays valid.
        meta.chapters.push(starter);
        write_metadata(dir, meta)?;
    } else {
        delete_chapter_file(dir, &starter)?;
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use crate::model::doc::Block;
    use crate::model::workspace::NodeKind;
    use crate::ops::library::create_book;
    use crate::storage::{chapter_io::read_chapter, workspace_io::read_workspace};
    use crate::text::words::doc_text;

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

    #[test]
    fn new_book_gets_chapters_and_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, meta, out) = import_new_book(&root, &p, &folders(&["D"])).unwrap();
        assert_eq!(meta.title, "Livro");
        assert_eq!((out.chapters, out.warnings), (2, 1));
        assert_eq!(meta.chapters.len(), 2);
        let c1 = &meta.chapters[0];
        assert_eq!((c1.title.as_str(), c1.notes.as_str()), ("Capítulo 1", "Abertura"));
        let d1 = read_chapter(&dir, c1).unwrap();
        assert_eq!(d1.content.len(), 3);
        assert_eq!(d1.content[1], Block::Separator);
        assert_eq!(doc_text(&d1), "Primeira cena.\n\nSegunda cena.");
        assert_eq!(meta.chapters[1].title, "Capítulo 2");
        let ws = read_workspace(&dir).unwrap();
        let titles: Vec<&str> = ws.items.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(titles, vec!["Pesquisa", "Anexos do manuscrito"]);
        let research = &ws.items[0];
        assert_eq!(research.children.len(), 2); // "Sumiu" has no file: warning, no node
        assert_eq!((research.children[0].kind, research.children[0].notes.as_str()), (NodeKind::Text, "Protagonista"));
        assert_eq!(research.children[1].kind, NodeKind::File);
        assert_eq!(ws.items[1].children[0].kind, NodeKind::Image);
        assert!(!ws.items.iter().any(|n| n.title == "Lixeira"));
    }

    #[test]
    fn open_book_appends_chapters_and_wraps_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let (dir, mut meta) = create_book(tmp.path(), "Minha").unwrap();
        let out = import_into(&p, &folders(&["D"]), &dir, &mut meta, Some("Livro")).unwrap();
        assert_eq!(out.chapters, 2);
        assert_eq!(meta.chapters.len(), 3);
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items.len(), 1);
        assert_eq!(ws.items[0].title, "Livro");
        assert_eq!(ws.items[0].children[0].title, "Pesquisa");
    }

    #[test]
    fn wrap_title_is_trimmed_and_falls_back_when_blank() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let (dir, mut meta) = create_book(tmp.path(), "Minha").unwrap();
        import_into(&p, &folders(&["D"]), &dir, &mut meta, Some("  Livro  ")).unwrap();
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items[0].title, "Livro");

        let (dir2, mut meta2) = create_book(tmp.path(), "Outra").unwrap();
        import_into(&p, &folders(&["D"]), &dir2, &mut meta2, Some("   ")).unwrap();
        let ws2 = read_workspace(&dir2).unwrap();
        assert_eq!(ws2.items[0].title, "Sem título");
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
        assert!(import_new_book(&root, &p, &folders(&["D"])).is_err());
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
        let pesquisa = &ws.items[0];
        assert_eq!(pesquisa.title, "Pesquisa");
        let mapa = &pesquisa.children[0];
        assert_eq!((mapa.kind, mapa.title.as_str()), (NodeKind::Folder, "Mapa"));
        assert_eq!(mapa.children.len(), 2);
        assert_eq!((mapa.children[0].kind, mapa.children[0].title.as_str()), (NodeKind::Image, "Mapa"));
        assert_eq!((mapa.children[1].kind, mapa.children[1].title.as_str()), (NodeKind::Text, "Nota"));
    }

    #[test]
    fn media_inside_chapter_subtree_still_gathers_its_children_text() {
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
        let (book_dir, meta, out) = import_new_book(&root, &p, &folders(&["D"])).unwrap();
        assert_eq!(out.chapters, 1);
        let doc = read_chapter(&book_dir, &meta.chapters[0]).unwrap();
        assert_eq!(doc_text(&doc), "Primeira cena.\n\nTexto da legenda.");
        let ws = read_workspace(&book_dir).unwrap();
        assert_eq!(ws.items[0].title, "Anexos do manuscrito");
        assert_eq!((ws.items[0].children[0].kind, ws.items[0].children[0].title.as_str()), (NodeKind::Image, "Foto"));
    }

    #[test]
    fn nothing_marked_puts_everything_in_the_workspace() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, meta, out) = import_new_book(&root, &p, &HashSet::new()).unwrap();
        assert_eq!(out.chapters, 0);
        // The empty starter chapter stays, so the book is still valid.
        assert_eq!(meta.chapters.len(), 1);
        assert!(read_chapter(&dir, &meta.chapters[0]).is_ok());
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items[0].title, "Manuscrito");
        assert_eq!(ws.items[0].children[0].kind, NodeKind::Folder);
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
