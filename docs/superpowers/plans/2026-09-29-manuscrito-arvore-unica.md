# Árvore única (Manuscrito dentro da Área de Trabalho) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two book tabs (Capítulos / Área de trabalho) with one tree whose fixed first node, **Manuscrito**, holds the chapters, shown in a collapsible sidebar next to the editor, plus a visible sun/moon theme button.

**Architecture:** Rust owns the structure: `area/area.json` goes to version 2 with two new node kinds (`manuscript`, `chapter`); pure rules live in `model/manuscript.rs`, disk operations (conversion chapter ⇄ text, chapter lookups by tree, word totals) in `ops/manuscript.rs`, and the v1 → v2 migration in `storage/migrate.rs`, run when a book is loaded into the `Library` cache. `metadata.json` keeps only book-level fields (`open` replaces `cur`, `chapters` is legacy, read only by the migration). The webview keeps only the tree it receives, the selection, the open node and the sidebar state (saved per book in the Rust prefs); the tabs, `ChapterIndex` and every index-based chapter action go away.

**Tech Stack:** Rust (Tauri 2, serde, tempfile for tests), SolidJS, Tailwind v4 + `src/styles/global.css`, vitest (jsdom via vite-plugin-solid, the in-memory mock API; store-level tests, no component rendering), bun.

**Spec:** `docs/superpowers/specs/2026-09-29-manuscrito-arvore-unica-design.md`

## Global Constraints

- Comments in English in every language (TS, Rust, CSS); UI text in Portuguese (`CLAUDE.md`).
- No god files: one responsibility per file; one Rust `mod` per subject (`CLAUDE.md`).
- Data and data processing stay in Rust (disk, parsing, counts, search, order); the webview holds only screen state and the open document (`CLAUDE.md`).
- Every task ends with a commit. Commit messages have **no** `Co-Authored-By` line and no attribution of any kind. Stage explicit paths only; never stage `.DS_Store`.
- `area/area.json` version **2**. Node kinds: `manuscript`, `folder`, `chapter`, `text`, `image`, `file`. Unknown fields keep surviving (`extra`).
- A `chapter` node has `id`, `title`, `notes`, `file` (relative to the **book folder**, in `capitulos/`), `status` (`rascunho` | `revisao` | `pronto`), `words`. Every other node's `file` stays relative to `area/`.
- The `manuscript` node is always the first item of `items`, titled "Manuscrito"; it cannot be deleted, renamed, moved, nor have a sibling before it. It (and folders inside it) accept only `chapter` and `folder` children.
- Chapter order = depth-first walk of the Manuscrito; folders only group; numbering is continuous (Cap. 1, 2, 3… across parts).
- A text moved into the Manuscrito becomes a `chapter` (file to `capitulos/<id>.md`, status `rascunho`, words counted); a chapter moved out becomes a `text` (file to `area/arquivos/<id>.md`, content and notes intact, status and words dropped). Images and attachments never enter the Manuscrito. The node id never changes.
- `metadata.json`: `chapters` is no longer written from version 2 on (legacy, read only by the migration); `cur` becomes `open` (id of the last opened node).
- Migration v1 → v2: copy `metadata.json` to `metadata.antes-da-migracao.json` (only if absent); build everything in memory; write `area.json` (v2) then `metadata.json` (without `chapters`), both atomically. On failure the book does not open and shows "Não foi possível atualizar esta obra para o novo formato. Nada foi alterado." (technical error to the log). A migrated book is never migrated again.
- New books and sample books are born v2 with a Manuscrito holding one chapter.
- Forbidden Manuscrito operations are refused in Rust with a Portuguese message shown in the status bar.
- Sidebar open by default; the « button and `Ctrl E` collapse/reopen it; the choice is saved per book in the Rust prefs. Focus mode (`Ctrl .`) hides the sidebar and both bars.
- Theme button in the top bar (library and book screens): a moon in the light theme, a sun in the dark theme; tooltip "Tema escuro" / "Tema claro" with `Ctrl J`; inline SVG, no new library; short transition respecting `prefers-reduced-motion`.
- No new dependencies (Rust or JS).
- Commands: Rust tests `cargo test --manifest-path src-tauri/Cargo.toml`; front tests `bun run test`; typecheck `./node_modules/.bin/tsc --noEmit -p .` (on Windows the binary is `tsc.exe`).

## Review Focus

1. **A v1 book whose `cur` is past the end, or whose `chapters` list is empty:** the migration must not panic; `open` becomes the chapter at `cur` when it exists, otherwise `None`, and an empty list still gets a Manuscrito. Covered by `upgrade_tolerates_bad_cur_and_no_chapters` in Task 2.
2. **Moving the last chapter out, or deleting the Manuscrito folder that holds every chapter:** refused with "A obra precisa de pelo menos um capítulo" and the tree on disk untouched. Covered by `last_chapter_cannot_leave` in Task 1 and `refused_move_leaves_disk_untouched` in Task 3.
3. **A drop at the root above the Manuscrito (index 0):** refused with "Nada pode ficar antes do Manuscrito", nothing moves. Covered by `nothing_goes_before_the_manuscript` in Task 1 and by the front `dropTarget` test in Task 7.
4. **A chapter whose file is missing is moved out of the Manuscrito:** it becomes an empty text, no error, no stray file. Covered by `missing_chapter_file_converts_to_empty_text` in Task 3.
5. **The library lists a book that was never opened since the update (still v1):** it shows the right chapter count and words, and nothing is written to disk until the book is opened. Covered by `listing_a_v1_book_writes_nothing` in Task 4.

---
## File Structure

**Rust (`src-tauri/src/`)**

| File | Change | Responsibility |
|---|---|---|
| `model/workspace.rs` | modify | Node kinds (`manuscript`, `chapter` added), chapter fields, constructors, container rule, tree version 2, `subtree_files` with kinds |
| `model/manuscript.rs` | create | Pure Manuscrito rules: where it is, chapter order (DFS), neighbor, totals, what may be created/moved/renamed/deleted |
| `model/metadata.rs` | modify | `open` field; `chapters` and `cur` become legacy (read, never written) |
| `model/views.rs` | modify | `BookMeta` with `open` (no chapter list), `BookSummary::from_tree` |
| `model/patches.rs` | modify | `BookPatch.open` replaces `cur` |
| `model/prefs.rs` | modify | `sidebar_closed` (book ids whose sidebar is collapsed) |
| `storage/paths.rs` | modify | `BACKUP_META_FILE`, `chapter_rel`, `area_text_rel` |
| `storage/chapter_io.rs` | modify | Chapter markdown by book-relative path (no `ChapterEntry`) |
| `storage/workspace_io.rs` | modify | Missing `area/` reads as a v1 tree; file helpers that resolve a node's path by kind |
| `storage/migrate.rs` | create | v1 → v2: pure `upgrade`, on-disk `open_book`, read-only `peek_tree` |
| `ops/manuscript.rs` | create | Disk operations of the Manuscrito: word total, new chapter file/node, conversion chapter ⇄ text, move with conversion |
| `ops/chapter.rs` | rewrite | Chapters found through the tree: load, save, update, split, neighbor, search, markdown |
| `ops/workspace.rs` | modify | Create chapters, rules on rename/delete/import, delete by kind, move through `ops::manuscript`; `to_chapter`/`from_chapter` removed |
| `ops/book.rs` | modify | `open` instead of `cur` |
| `ops/library.rs` | modify | New books and samples born v2 |
| `state.rs` | modify | Loads books through the migration; word totals from the tree |
| `commands/{book,chapter,workspace,library,scrivener,cloud_backup}.rs`, `lib.rs` | modify | New command set (`chapter_neighbor`; `chapter_insert/move/delete`, `workspace_to_chapter/from_chapter` removed) |
| `cloud/restore.rs`, `cloud/comments.rs`, `cloud/inbox.rs` | modify | Totals from the tree; comments land in the node notes (chapter or not) |
| `scrivener/import.rs` | modify | Chosen items become chapter nodes at the end of the Manuscrito |

**Front (`src/`)**

| File | Change | Responsibility |
|---|---|---|
| `lib/manuscript.ts` (+ test) | create | Pure tree reading for display: container kinds, chapter order and number, totals, counts |
| `lib/tree.ts` (+ test) | modify | Drop rules know containers and the Manuscrito |
| `lib/theme.ts` (+ test) | create | Icon and tooltip of the theme button |
| `api/types.ts`, `api/chapter.ts`, `api/workspace.ts` | modify | v2 shapes and commands |
| `api/mock/manuscript.ts` | create | Mock copy of the Rust rules and conversions |
| `api/mock/{db,book,chapter,workspace,library,cloud,prefs}.ts` (+ `chapter.test.ts`) | modify | Mock books are v2 trees |
| `lib/types.ts`, `lib/constants.ts` | modify | `View = "library" \| "book"`, no `"index"` panel, default prefs |
| `store/state.ts`, `store/saving.ts`, `store/focus.ts`, `store/selectors/book.ts` | modify | Open chapter = open node of kind `chapter`; `editNode` |
| `store/actions/open.ts` | create | Opening any node (chapter, text, media), the initial node of a book, previous/next chapter |
| `store/actions/tabs.ts`, `store/keys/index.ts`, `components/panels/ChapterIndex.tsx` | delete | Tabs and the chapter drawer |
| `store/actions/{chapters,workspace,library,cloud,scrivener,ui}.ts` (+ tests) | modify | Chapter actions by id; tree actions incl. moves into/out of the Manuscrito |
| `store/actions/sidebar.ts` (+ test) | create | Collapse state per book, persisted through prefs |
| `store/keys/global.ts` | modify | No `Ctrl 1/2`; `Ctrl E` toggles the sidebar |
| `store/commands/chapter.ts`, `store/commands/palette.ts` (+ test), `store/commands/workspace.ts` | create/modify | Palette items for the open chapter and the tree |
| `components/workspace/{Workspace,WorkspaceTree,TreeRow,NodeIcon,NodeView,EmptyArea,dragMove}.tsx/ts` | modify | The book screen: sidebar + main pane |
| `components/workspace/SidebarFoot.tsx` | create | "+ Novo" menu and the « button |
| `components/workspace/treeMenu.ts` (+ test) | modify | Context menu per node type and the "+ Novo" options |
| `components/chrome/ThemeToggle.tsx` | create | Sun/moon button |
| `components/chrome/{TopBar,BottomBar,StatusMessage}.tsx`, `components/editor/{Editor,ChapterLabel}.tsx`, `components/panels/{NotesPanel,CommandPalette}.tsx`, `components/cloud/BookCloudSection.tsx`, `App.tsx` | modify | No tabs; chapter data from the tree |
| `editor/writerKeys.ts`, `editor/createEditor.ts` | modify | Free texts have no `Ctrl Enter` separator |
| `data/shortcuts.ts`, `styles/global.css`, `README.md` | modify | Help, styles, docs |

**Cloud server (separate repo `~/app/timerdev`)**: `src/server/scribalis/book.ts` (+ `book.test.ts`) reads chapters from the v2 tree (Task 14).

---
### Task 1: Node kinds and pure Manuscrito rules

**Files:**
- Modify: `src-tauri/src/model/workspace.rs` (whole file below)
- Create: `src-tauri/src/model/manuscript.rs`
- Modify: `src-tauri/src/model/mod.rs`
- Test: in-file `#[cfg(test)]` modules of both files

**Interfaces:**
- Consumes: `crate::model::metadata::Status`, `crate::error::{AppError, AppResult}`.
- Produces:
  - `NodeKind::{Manuscript, Folder, Chapter, Text, Image, File}` (serde lowercase), `NodeKind::is_container(self) -> bool`.
  - `Node { id, kind, title, notes, file: Option<String>, status: Option<Status>, words: Option<usize>, children, extra }`; `Node::folder(id, title)`, `Node::leaf(id, kind, title, file)`, `Node::chapter(id, title, file)`, `Node::manuscript(id)`.
  - `WORKSPACE_VERSION = 2`, `LEGACY_WORKSPACE_VERSION = 1`.
  - `subtree_files(&Node) -> Vec<(NodeKind, String)>`.
  - `model::manuscript`: `MANUSCRIPT_TITLE`, `LAST_CHAPTER`, `NO_MEDIA`, `manuscript(&[Node]) -> Option<&Node>`, `manuscript_mut(&mut [Node]) -> Option<&mut Node>`, `in_manuscript(&[Node], &str) -> bool`, `chapters(&[Node]) -> Vec<&Node>`, `chapter(&[Node], &str) -> Option<&Node>`, `position(&[Node], &str) -> Option<usize>`, `neighbor(&[Node], &str, i32) -> Option<String>`, `total_words(&[Node]) -> usize`, `ready(&[Node]) -> usize`, `chapters_in(&Node) -> usize`, `root_index(&[Node], Option<&str>, usize) -> usize`, `check_rename`, `check_delete`, `check_create(&[Node], NodeKind, Option<&str>)`, `check_move(&[Node], &str, Option<&str>, usize)` (all `-> AppResult<()>`).

Nothing else changes behavior yet: `insert`/`move_node` accept the Manuscrito as a container. Until Task 2, a book without `area/` reads as an empty tree tagged version 2; nothing migrates yet, and Task 2 makes that case read as version 1 before the migration exists, so run Tasks 1 and 2 back to back.

- [ ] **Step 1: Write the failing tests (new module)**

Create `src-tauri/src/model/manuscript.rs` with only the tests first:

```rust
//! Pure rules of the Manuscrito: the fixed first node of the tree, which holds the chapters.

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
    fn the_manuscript_is_fixed() {
        let t = tree();
        assert_eq!(check_rename(&t, "m").unwrap_err().0, "O Manuscrito não pode ser renomeado");
        assert_eq!(check_delete(&t, "m").unwrap_err().0, "O Manuscrito não pode ser excluído");
        assert_eq!(check_move(&t, "m", None, 1).unwrap_err().0, "O Manuscrito não pode ser movido");
        assert!(check_rename(&t, "c1").is_ok());
    }

    #[test]
    fn nothing_goes_before_the_manuscript() {
        let t = tree();
        assert_eq!(check_move(&t, "f", None, 0).unwrap_err().0, "Nada pode ficar antes do Manuscrito");
        assert!(check_move(&t, "t", None, 1).is_ok());
        assert_eq!(root_index(&t, None, 0), 1);
        assert_eq!(root_index(&t, Some("f"), 0), 0);
        assert_eq!(root_index(&t[1..], None, 0), 0);
    }

    #[test]
    fn only_chapters_and_folders_live_in_the_manuscript() {
        let t = tree();
        assert_eq!(check_move(&t, "i", Some("p"), 0).unwrap_err().0, NO_MEDIA);
        // A folder holding an image cannot go in either.
        assert_eq!(check_move(&t, "f", Some("m"), 0).unwrap_err().0, NO_MEDIA);
        // A text may: it becomes a chapter on the way in.
        assert!(check_move(&t, "t", Some("p"), 0).is_ok());
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
        assert_eq!(check_move(&t, "c1", None, 1).unwrap_err().0, LAST_CHAPTER);
        assert_eq!(check_delete(&t, "c1").unwrap_err().0, LAST_CHAPTER);
        // The folder holding every chapter is refused too.
        assert_eq!(check_delete(&t, "p").unwrap_err().0, LAST_CHAPTER);
        assert_eq!(check_move(&t, "p", None, 1).unwrap_err().0, LAST_CHAPTER);
        // Moving inside the Manuscrito is fine.
        assert!(check_move(&t, "c1", Some("m"), 0).is_ok());
        // With other chapters around, one may leave.
        let t = tree();
        assert!(check_move(&t, "c3", None, 2).is_ok());
        assert!(check_delete(&t, "p").is_ok());
    }

    #[test]
    fn empty_folders_are_free_in_a_book_without_chapters() {
        let mut m = Node::manuscript("m".into());
        m.children = vec![Node::folder("p".into(), "Parte")];
        let t = vec![m];
        assert!(check_delete(&t, "p").is_ok());
        assert!(check_move(&t, "p", None, 1).is_ok());
    }
}
```

Add the module to `src-tauri/src/model/mod.rs`, keeping alphabetical order:

```rust
pub mod doc;
pub mod manuscript;
pub mod marks;
pub mod metadata;
pub mod para_attrs;
pub mod patches;
pub mod prefs;
pub mod views;
pub mod workspace;
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml model::manuscript`
Expected: compile errors — `Node::chapter`, `Node::manuscript`, `chapters`, `check_move`… not found.

- [ ] **Step 3: Replace `src-tauri/src/model/workspace.rs`**

```rust
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
```

`subtree_files` now returns kinds; update its single caller in `src-tauri/src/ops/workspace.rs` so the crate keeps compiling (the full rewrite of `delete` comes in Task 4). Replace `discard` and the `files` variable type in `delete`:

```rust
/// Discards files the tree no longer references; the tree is already saved.
fn discard(dir: &Path, files: &[(NodeKind, String)]) {
    for (kind, rel) in files {
        if let Err(e) = remove_file_at(dir, *kind, rel) {
            eprintln!("could not remove workspace file {rel}: {e}");
        }
    }
}
```

and in `to_chapter` change `discard(dir, &[file]);` to `discard(dir, &[(NodeKind::Text, file)]);`. `remove_file_at` does not exist yet, so for this task add it at the end of `src-tauri/src/storage/workspace_io.rs` (Task 2 builds on it):

```rust
/// Removes the file of a node of `kind`; a missing file is fine. Chapters resolve from the
/// book folder, every other kind from `area/`.
pub fn remove_file_at(book_dir: &Path, kind: NodeKind, rel: &str) -> AppResult<()> {
    let path = if kind == NodeKind::Chapter { safe_join(book_dir, rel)? } else { area_path(book_dir, rel)? };
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}
```

and import it in `ops/workspace.rs`: add `remove_file_at` to the `workspace_io::{…}` list (and drop `remove_area_file` from that list, it is no longer used there).

- [ ] **Step 4: Write the rules in `src-tauri/src/model/manuscript.rs`**

Put this above the `#[cfg(test)]` module:

```rust
use super::metadata::Status;
use super::workspace::{find, Node, NodeKind};
use crate::error::{AppError, AppResult};

pub const MANUSCRIPT_TITLE: &str = "Manuscrito";
pub const LAST_CHAPTER: &str = "A obra precisa de pelo menos um capítulo";
pub const NO_MEDIA: &str = "Imagens e anexos não entram no Manuscrito";

fn refuse(msg: &str) -> AppResult<()> {
    Err(AppError::msg(msg))
}

/// The Manuscrito: always the first root item.
pub fn manuscript(items: &[Node]) -> Option<&Node> {
    items.first().filter(|n| n.kind == NodeKind::Manuscript)
}

pub fn manuscript_mut(items: &mut [Node]) -> Option<&mut Node> {
    items.first_mut().filter(|n| n.kind == NodeKind::Manuscript)
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

/// Root position for a new item: never before the Manuscrito.
pub fn root_index(items: &[Node], parent: Option<&str>, index: usize) -> usize {
    if parent.is_none() && manuscript(items).is_some() { index.max(1) } else { index }
}

pub fn check_rename(items: &[Node], id: &str) -> AppResult<()> {
    if manuscript(items).is_some_and(|m| m.id == id) {
        return refuse("O Manuscrito não pode ser renomeado");
    }
    Ok(())
}

/// A missing id passes: the caller reports "Item não encontrado".
pub fn check_delete(items: &[Node], id: &str) -> AppResult<()> {
    let Some(node) = find(items, id) else { return Ok(()) };
    if node.kind == NodeKind::Manuscript {
        return refuse("O Manuscrito não pode ser excluído");
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

/// Moving `id` under `parent` at `index` (position after taking it out). A missing id
/// passes: `workspace::move_node` reports it.
pub fn check_move(items: &[Node], id: &str, parent: Option<&str>, index: usize) -> AppResult<()> {
    let Some(node) = find(items, id) else { return Ok(()) };
    if node.kind == NodeKind::Manuscript {
        return refuse("O Manuscrito não pode ser movido");
    }
    if parent.is_none() && index == 0 && manuscript(items).is_some() {
        return refuse("Nada pode ficar antes do Manuscrito");
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
```

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS (all existing tests plus the new `model::manuscript` and `model::workspace` tests).

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/model/workspace.rs src-tauri/src/model/manuscript.rs src-tauri/src/model/mod.rs src-tauri/src/ops/workspace.rs src-tauri/src/storage/workspace_io.rs
git commit -m "feat(model): manuscript and chapter nodes with pure manuscript rules"
```

---
### Task 2: Storage by node kind and the v1 → v2 migration

**Files:**
- Modify: `src-tauri/src/model/metadata.rs` (fields `cur`, `chapters`, new `open`; tests)
- Modify: `src-tauri/src/storage/paths.rs` (constants and two path helpers)
- Modify: `src-tauri/src/storage/chapter_io.rs` (path-based functions)
- Modify: `src-tauri/src/storage/workspace_io.rs` (legacy default, kind-aware helpers, drop `remove_area_file`)
- Create: `src-tauri/src/storage/migrate.rs`
- Modify: `src-tauri/src/storage/mod.rs`
- Test: in-file `#[cfg(test)]` modules

**Interfaces:**
- Consumes (Task 1): `Node::chapter`, `Node::manuscript`, `NodeKind::Chapter`, `WORKSPACE_VERSION`, `LEGACY_WORKSPACE_VERSION`, `remove_file_at`.
- Produces:
  - `Metadata.open: Option<String>`; `cur` and `chapters` are omitted from the JSON when zero/empty.
  - `paths::BACKUP_META_FILE = "metadata.antes-da-migracao.json"`, `paths::chapter_rel(id) -> String` (`capitulos/<id>.md`), `paths::area_text_rel(id) -> String` (`arquivos/<id>.md`, relative to `area/`).
  - `chapter_io::{read_at(dir, rel) -> AppResult<Doc>, write_at(dir, rel, &Doc) -> AppResult<()>, delete_at(dir, rel) -> AppResult<()>}` (book-relative; the `&ChapterEntry` functions stay as wrappers until Task 5).
  - `workspace_io::{read_doc_at(dir, NodeKind, rel) -> AppResult<Doc>, write_doc_at(dir, NodeKind, rel, &Doc) -> AppResult<()>, remove_file_at(..)}`; `read_workspace` returns version 1 for a book without `area/`.
  - `migrate::{MIGRATION_FAILED, needs_upgrade(&Workspace) -> bool, upgrade(&Metadata, &Workspace, String) -> (Metadata, Workspace), open_book(&Path) -> AppResult<Metadata>, peek_tree(&Path, &Metadata) -> AppResult<Vec<Node>>}`.

- [ ] **Step 1: Write the failing migration tests**

Create `src-tauri/src/storage/migrate.rs` with the tests only:

```rust
//! Upgrades a book from tree version 1 (chapters listed in `metadata.json`) to version 2
//! (chapters inside the Manuscrito node of `area/area.json`).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::metadata::{ChapterEntry, Metadata, Status};
    use crate::model::workspace::{Node, NodeKind, Workspace, LEGACY_WORKSPACE_VERSION};
    use crate::storage::{
        metadata_io::{read_metadata, write_metadata},
        paths::{AREA_DIR, AREA_FILE, BACKUP_META_FILE, META_FILE},
        workspace_io::{read_workspace, write_workspace},
    };
    use serde_json::Value;
    use std::fs;

    fn entry(id: &str, title: &str, status: Status, words: usize) -> ChapterEntry {
        let mut c = ChapterEntry::new(id.into());
        c.title = title.into();
        c.status = status;
        c.words = words;
        c.notes = format!("notas de {title}");
        c
    }

    /// A v1 book as the previous release wrote it: three chapters, `cur` on the second.
    fn v1_meta() -> Metadata {
        let mut first = entry("c1", "Um", Status::Pronto, 10);
        first.extra.insert("cor".into(), Value::from("azul"));
        let mut meta = Metadata::new("b1".into(), "Obra", vec![
            first,
            entry("c2", "Dois", Status::Revisao, 20),
            entry("c3", "Três", Status::Rascunho, 30),
        ]);
        meta.cur = 1;
        meta
    }

    fn v1_book(with_area: bool) -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        write_metadata(dir.path(), &v1_meta()).unwrap();
        if with_area {
            let ws = Workspace {
                version: LEGACY_WORKSPACE_VERSION,
                items: vec![Node::folder("f".into(), "Pesquisa")],
                extra: Default::default(),
            };
            write_workspace(dir.path(), &ws).unwrap();
        }
        dir
    }

    fn raw_meta(dir: &std::path::Path) -> Value {
        serde_json::from_str(&fs::read_to_string(dir.join(META_FILE)).unwrap()).unwrap()
    }

    #[test]
    fn upgrade_keeps_order_ids_notes_status_and_unknown_fields() {
        let ws = Workspace { version: LEGACY_WORKSPACE_VERSION, items: vec![Node::folder("f".into(), "P")], extra: Default::default() };
        let (meta, ws) = upgrade(&v1_meta(), &ws, "m".into());
        assert_eq!(ws.version, 2);
        let m = &ws.items[0];
        assert_eq!((m.id.as_str(), m.kind, m.title.as_str()), ("m", NodeKind::Manuscript, "Manuscrito"));
        let ids: Vec<&str> = m.children.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids, vec!["c1", "c2", "c3"]);
        let c1 = &m.children[0];
        assert_eq!(c1.kind, NodeKind::Chapter);
        assert_eq!((c1.title.as_str(), c1.notes.as_str()), ("Um", "notas de Um"));
        assert_eq!((c1.status, c1.words), (Some(Status::Pronto), Some(10)));
        assert_eq!(c1.file.as_deref(), Some("capitulos/c1.md"));
        assert_eq!(c1.extra["cor"], "azul");
        assert_eq!(ws.items[1].id, "f");
        assert_eq!(meta.open.as_deref(), Some("c2"));
        assert!(meta.chapters.is_empty());
    }

    #[test]
    fn upgrade_tolerates_bad_cur_and_no_chapters() {
        let mut meta = v1_meta();
        meta.cur = 9;
        let (out, _) = upgrade(&meta, &Workspace::default(), "m".into());
        assert_eq!(out.open, None);
        meta.chapters.clear();
        let (_, ws) = upgrade(&meta, &Workspace::default(), "m".into());
        assert_eq!(ws.items.len(), 1);
        assert!(ws.items[0].children.is_empty());
    }

    #[test]
    fn open_book_migrates_once_and_keeps_a_copy() {
        let tmp = v1_book(true);
        let dir = tmp.path();
        let original = fs::read_to_string(dir.join(META_FILE)).unwrap();
        let meta = open_book(dir).unwrap();
        assert_eq!(meta.open.as_deref(), Some("c2"));
        assert_eq!(fs::read_to_string(dir.join(BACKUP_META_FILE)).unwrap(), original);
        let ws = read_workspace(dir).unwrap();
        assert_eq!(ws.version, 2);
        assert_eq!(ws.items[0].children.len(), 3);
        assert_eq!(ws.items[1].id, "f");
        let raw = raw_meta(dir);
        assert!(raw.get("chapters").is_none());
        assert!(raw.get("cur").is_none());
        assert_eq!(raw["open"], "c2");
        assert!(!dir.join(AREA_DIR).join(format!("{AREA_FILE}.tmp")).exists());

        // A second open changes nothing: same Manuscrito id, backup untouched.
        let manuscript = ws.items[0].id.clone();
        fs::write(dir.join(BACKUP_META_FILE), "marca").unwrap();
        open_book(dir).unwrap();
        assert_eq!(read_workspace(dir).unwrap().items[0].id, manuscript);
        assert_eq!(fs::read_to_string(dir.join(BACKUP_META_FILE)).unwrap(), "marca");
    }

    #[test]
    fn a_book_without_area_folder_migrates() {
        let tmp = v1_book(false);
        open_book(tmp.path()).unwrap();
        let ws = read_workspace(tmp.path()).unwrap();
        assert_eq!(ws.items.len(), 1);
        assert_eq!(ws.items[0].kind, NodeKind::Manuscript);
    }

    #[test]
    fn failed_migration_leaves_the_book_as_it_was() {
        let tmp = v1_book(false);
        let dir = tmp.path();
        // A directory where the tree's temp file goes makes the first write fail.
        fs::create_dir_all(dir.join(AREA_DIR).join(format!("{AREA_FILE}.tmp"))).unwrap();
        assert_eq!(open_book(dir).unwrap_err().0, MIGRATION_FAILED);
        assert_eq!(read_metadata(dir).unwrap().chapters.len(), 3);
        assert!(!dir.join(AREA_DIR).join(AREA_FILE).exists());
    }

    #[test]
    fn peek_tree_writes_nothing() {
        let tmp = v1_book(false);
        let meta = read_metadata(tmp.path()).unwrap();
        let items = peek_tree(tmp.path(), &meta).unwrap();
        assert_eq!(items[0].children.len(), 3);
        assert!(!tmp.path().join(AREA_DIR).exists());
        assert!(!tmp.path().join(BACKUP_META_FILE).exists());
    }
}
```

Register it in `src-tauri/src/storage/mod.rs`:

```rust
pub mod atomic;
pub mod chapter_io;
pub mod images;
pub mod metadata_io;
pub mod migrate;
pub mod paths;
pub mod workspace_io;
```

- [ ] **Step 2: Run them to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml storage::migrate`
Expected: compile errors (`upgrade`, `open_book`, `BACKUP_META_FILE`, `Metadata.open` not found).

- [ ] **Step 3: Metadata fields**

In `src-tauri/src/model/metadata.rs`, replace the `cur` and `chapters` fields of `Metadata` and add `open`:

```rust
    /// Legacy (tree v1): index of the open chapter. Read only by the migration.
    #[serde(default, skip_serializing_if = "is_zero")]
    pub cur: usize,
    /// Id of the last opened node (chapter or not).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub open: Option<String>,
```

```rust
    /// Legacy (tree v1): the chapter list. Read only by the migration; never written once empty.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub chapters: Vec<ChapterEntry>,
```

Add `open: None,` to `Metadata::new` (after `cur: 0,`), and below the `Separator` default impl:

```rust
fn is_zero(n: &usize) -> bool {
    *n == 0
}
```

Add this test to the module's tests:

```rust
    #[test]
    fn v2_metadata_omits_the_legacy_fields() {
        let mut meta = Metadata::new("a".into(), "T", vec![]);
        let v = serde_json::to_value(&meta).unwrap();
        assert!(v.get("chapters").is_none() && v.get("cur").is_none() && v.get("open").is_none());
        meta.open = Some("c1".into());
        assert_eq!(serde_json::to_value(&meta).unwrap()["open"], "c1");
    }
```

- [ ] **Step 4: Paths and chapter files by path**

Append to the constants of `src-tauri/src/storage/paths.rs` and add the helpers after `safe_join`:

```rust
/// Copy of `metadata.json` taken before the migration to tree version 2.
pub const BACKUP_META_FILE: &str = "metadata.antes-da-migracao.json";
```

```rust
/// Book-relative file of chapter `id`.
pub fn chapter_rel(id: &str) -> String {
    format!("{CHAPTERS_DIR}/{id}.md")
}

/// `area/`-relative file of a text that came out of the Manuscrito.
pub fn area_text_rel(id: &str) -> String {
    format!("{AREA_FILES_DIR}/{id}.md")
}
```

Replace the functions of `src-tauri/src/storage/chapter_io.rs` (keep the tests module as is):

```rust
use std::{fs, io::ErrorKind, path::Path};

use super::{atomic::write_atomic, paths::safe_join};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, metadata::ChapterEntry};

/// Raw markdown of a book-relative file; a missing file reads as empty.
pub fn read_raw_at(dir: &Path, rel: &str) -> AppResult<String> {
    match fs::read_to_string(safe_join(dir, rel)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

pub fn read_at(dir: &Path, rel: &str) -> AppResult<Doc> {
    Ok(parse(&read_raw_at(dir, rel)?))
}

pub fn write_at(dir: &Path, rel: &str, doc: &Doc) -> AppResult<()> {
    let path = safe_join(dir, rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    write_atomic(&path, serialize(doc).as_bytes())?;
    Ok(())
}

pub fn delete_at(dir: &Path, rel: &str) -> AppResult<()> {
    match fs::remove_file(safe_join(dir, rel)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
    }
}

// Legacy entry-based wrappers, removed once the Scrivener import stops using `ChapterEntry` (Task 5).

pub fn read_chapter_raw(dir: &Path, entry: &ChapterEntry) -> AppResult<String> {
    read_raw_at(dir, &entry.file)
}

pub fn read_chapter(dir: &Path, entry: &ChapterEntry) -> AppResult<Doc> {
    read_at(dir, &entry.file)
}

pub fn write_chapter(dir: &Path, entry: &ChapterEntry, doc: &Doc) -> AppResult<()> {
    write_at(dir, &entry.file, doc)
}

pub fn delete_chapter_file(dir: &Path, entry: &ChapterEntry) -> AppResult<()> {
    delete_at(dir, &entry.file)
}
```

- [ ] **Step 5: Kind-aware tree storage**

In `src-tauri/src/storage/workspace_io.rs`:

1. Change the imports to:

```rust
use super::{
    atomic::write_atomic,
    chapter_io,
    paths::{safe_join, AREA_DIR, AREA_FILE, AREA_FILES_DIR},
};
use crate::error::AppResult;
use crate::markdown::{parse::parse, serialize::serialize};
use crate::model::{doc::Doc, workspace::{NodeKind, Workspace, LEGACY_WORKSPACE_VERSION}};
```

2. Replace `read_workspace`:

```rust
/// The tree; a book without `area/` predates it, so it reads as an empty v1 tree.
pub fn read_workspace(book_dir: &Path) -> AppResult<Workspace> {
    match fs::read_to_string(book_dir.join(AREA_DIR).join(AREA_FILE)) {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Workspace { version: LEGACY_WORKSPACE_VERSION, ..Workspace::default() }),
        Err(e) => Err(e.into()),
    }
}
```

3. Delete `remove_area_file` (its only caller moved to `remove_file_at` in Task 1) and add, next to `remove_file_at`:

```rust
/// The document of a node of `kind`: chapters resolve from the book folder, texts from `area/`.
pub fn read_doc_at(book_dir: &Path, kind: NodeKind, rel: &str) -> AppResult<Doc> {
    if kind == NodeKind::Chapter { chapter_io::read_at(book_dir, rel) } else { read_node_doc(book_dir, rel) }
}

pub fn write_doc_at(book_dir: &Path, kind: NodeKind, rel: &str, doc: &Doc) -> AppResult<()> {
    if kind == NodeKind::Chapter { chapter_io::write_at(book_dir, rel, doc) } else { write_node_doc(book_dir, rel, doc) }
}
```

Add a test module at the end of the file:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};

    #[test]
    fn missing_area_reads_as_empty_v1() {
        let dir = tempfile::tempdir().unwrap();
        let ws = read_workspace(dir.path()).unwrap();
        assert_eq!((ws.version, ws.items.len()), (1, 0));
    }

    #[test]
    fn chapter_files_resolve_from_the_book_and_texts_from_area() {
        let dir = tempfile::tempdir().unwrap();
        let doc = Doc::new(vec![Block::paragraph(vec![Inline::text("Oi")])]);
        write_doc_at(dir.path(), NodeKind::Chapter, "capitulos/c.md", &doc).unwrap();
        write_doc_at(dir.path(), NodeKind::Text, "arquivos/t.md", &doc).unwrap();
        assert!(dir.path().join("capitulos/c.md").is_file());
        assert!(dir.path().join("area/arquivos/t.md").is_file());
        assert_eq!(read_doc_at(dir.path(), NodeKind::Chapter, "capitulos/c.md").unwrap(), doc);
        remove_file_at(dir.path(), NodeKind::Chapter, "capitulos/c.md").unwrap();
        remove_file_at(dir.path(), NodeKind::Text, "arquivos/t.md").unwrap();
        remove_file_at(dir.path(), NodeKind::Text, "arquivos/t.md").unwrap();
        assert!(!dir.path().join("capitulos/c.md").exists());
        assert!(!dir.path().join("area/arquivos/t.md").exists());
    }
}
```

- [ ] **Step 6: Write the migration**

Put this above the tests in `src-tauri/src/storage/migrate.rs`:

```rust
use std::path::Path;

use super::{
    atomic::write_atomic,
    metadata_io::{read_metadata, write_metadata},
    paths::{BACKUP_META_FILE, META_FILE},
    workspace_io::{read_workspace, write_workspace},
};
use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::{
    metadata::{ChapterEntry, Metadata},
    workspace::{Node, Workspace, WORKSPACE_VERSION},
};

pub const MIGRATION_FAILED: &str = "Não foi possível atualizar esta obra para o novo formato. Nada foi alterado.";

pub fn needs_upgrade(ws: &Workspace) -> bool {
    ws.version < WORKSPACE_VERSION
}

fn chapter_node(c: &ChapterEntry) -> Node {
    let mut n = Node::chapter(c.id.clone(), &c.title, &c.file);
    n.notes = c.notes.clone();
    n.status = Some(c.status);
    n.words = Some(c.words);
    n.extra = c.extra.clone();
    n
}

/// The v2 pair of a v1 book, built in memory: a Manuscrito holding one chapter per legacy
/// entry (same id, title, notes, status, words, file and unknown fields, same order), then
/// the old items unchanged. `cur` becomes `open`; no file moves.
pub fn upgrade(meta: &Metadata, ws: &Workspace, manuscript_id: String) -> (Metadata, Workspace) {
    let mut manuscript = Node::manuscript(manuscript_id);
    manuscript.children = meta.chapters.iter().map(chapter_node).collect();
    let mut items = Vec::with_capacity(ws.items.len() + 1);
    items.push(manuscript);
    items.extend(ws.items.iter().cloned());
    let mut out = meta.clone();
    out.open = meta.chapters.get(meta.cur).map(|c| c.id.clone());
    out.chapters.clear();
    out.cur = 0;
    (out, Workspace { version: WORKSPACE_VERSION, items, extra: ws.extra.clone() })
}

/// Copies `metadata.json` aside once, before its first rewrite.
fn keep_original(dir: &Path) -> AppResult<()> {
    let backup = dir.join(BACKUP_META_FILE);
    if backup.exists() {
        return Ok(());
    }
    write_atomic(&backup, &std::fs::read(dir.join(META_FILE))?)?;
    Ok(())
}

fn migrate(dir: &Path, meta: &Metadata, ws: &Workspace) -> AppResult<Metadata> {
    keep_original(dir)?;
    let (new_meta, new_ws) = upgrade(meta, ws, new_id());
    // The tree first: a stop between the two writes leaves the chapters in both files, never in none.
    write_workspace(dir, &new_ws)?;
    write_metadata(dir, &new_meta)?;
    Ok(new_meta)
}

/// Reads a book for editing, migrating it on disk first when its tree is still v1.
pub fn open_book(dir: &Path) -> AppResult<Metadata> {
    let meta = read_metadata(dir)?;
    let ws = read_workspace(dir)?;
    if !needs_upgrade(&ws) {
        return Ok(meta);
    }
    migrate(dir, &meta, &ws).map_err(|e| {
        eprintln!("migration of {} failed: {e}", dir.display());
        AppError::msg(MIGRATION_FAILED)
    })
}

/// The v2 tree of a book without writing anything (the library lists books not opened since the update).
pub fn peek_tree(dir: &Path, meta: &Metadata) -> AppResult<Vec<Node>> {
    let ws = read_workspace(dir)?;
    if !needs_upgrade(&ws) {
        return Ok(ws.items);
    }
    Ok(upgrade(meta, &ws, String::new()).1.items)
}
```

- [ ] **Step 7: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS. (Existing ops still use `meta.chapters`; their books stay v1 because nothing calls `open_book` yet.)

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/model/metadata.rs src-tauri/src/storage/paths.rs src-tauri/src/storage/chapter_io.rs src-tauri/src/storage/workspace_io.rs src-tauri/src/storage/migrate.rs src-tauri/src/storage/mod.rs
git commit -m "feat(storage): tree v2 migration with backup copy and kind-aware files"
```

---
### Task 3: Manuscrito disk operations (conversion chapter ⇄ text)

**Files:**
- Modify: `src-tauri/src/model/workspace.rs` (add `locate`)
- Create: `src-tauri/src/ops/manuscript.rs`
- Modify: `src-tauri/src/ops/mod.rs`
- Test: in-file `#[cfg(test)]` modules

**Interfaces:**
- Consumes: Task 1 rules (`check_move`, `in_manuscript`, `total_words`, `manuscript`), Task 2 storage (`read_doc_at`, `write_doc_at`, `remove_file_at`, `chapter_rel`, `area_text_rel`, `migrate::open_book` in tests), existing `ops::workspace::{create, save_doc, load_doc, set_notes}` and `ops::library::create_book` (tests).
- Produces:
  - `model::workspace::locate(&[Node], &str) -> Option<(Option<&str>, usize)>`.
  - `ops::manuscript::book_words(&Path) -> AppResult<usize>`.
  - `ops::manuscript::new_chapter(&Path, title: &str, &Doc) -> AppResult<Node>` (writes `capitulos/<id>.md`).
  - `ops::manuscript::insert_after(&mut Vec<Node>, after_id: &str, Node) -> AppResult<()>`.
  - `ops::manuscript::move_converting(&Path, id: &str, parent: Option<&str>, index: usize) -> AppResult<Vec<Node>>`.

- [ ] **Step 1: Write the failing tests**

Add `pub mod manuscript;` to `src-tauri/src/ops/mod.rs`:

```rust
pub mod book;
pub mod chapter;
pub mod library;
pub mod manuscript;
pub mod workspace;
```

Create `src-tauri/src/ops/manuscript.rs` with the tests only:

```rust
//! Disk operations of the Manuscrito: word totals, new chapter files, and the conversion of a
//! subtree between chapters (`capitulos/`) and free texts (`area/arquivos/`).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::manuscript::{chapters, manuscript, LAST_CHAPTER};
    use crate::model::metadata::Status;
    use crate::ops::{library::create_book, workspace};
    use crate::storage::{migrate::open_book, paths::AREA_DIR, workspace_io::read_workspace};
    use std::fs;
    use std::path::PathBuf;

    /// A v2 book with its single empty chapter.
    fn book() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Obra").unwrap();
        open_book(&dir).unwrap();
        (root, dir)
    }

    fn manuscript_id(dir: &Path) -> String {
        manuscript(&read_workspace(dir).unwrap().items).unwrap().id.clone()
    }

    /// Adds a second chapter with `text` at the end of the Manuscrito.
    fn add_chapter(dir: &Path, text: &str) -> String {
        let node = new_chapter(dir, "Dois", &parse(text)).unwrap();
        let id = node.id.clone();
        let mut ws = read_workspace(dir).unwrap();
        let m = ws.items[0].id.clone();
        insert(&mut ws.items, Some(&m), usize::MAX, node).unwrap();
        write_workspace(dir, &ws).unwrap();
        id
    }

    #[test]
    fn a_text_moved_in_becomes_a_chapter_with_the_same_id() {
        let (_r, dir) = book();
        let t = workspace::create(&dir, None, 1, NodeKind::Text, "Prólogo").unwrap().id;
        workspace::set_notes(&dir, &t, "cena solta").unwrap();
        workspace::save_doc(&dir, &t, &parse("um dois três")).unwrap();
        let items = move_converting(&dir, &t, Some(&manuscript_id(&dir)), 0).unwrap();
        let node = find(&items, &t).unwrap();
        assert_eq!(node.kind, NodeKind::Chapter);
        assert_eq!(node.file.as_deref(), Some(format!("capitulos/{t}.md").as_str()));
        assert_eq!((node.status, node.words, node.notes.as_str()), (Some(Status::Rascunho), Some(3), "cena solta"));
        assert_eq!(read_doc_at(&dir, NodeKind::Chapter, node.file.as_ref().unwrap()).unwrap(), parse("um dois três"));
        assert!(!dir.join(AREA_DIR).join(format!("{t}.md")).exists());
        assert_eq!(chapters(&items)[0].id, t);
        assert_eq!(read_workspace(&dir).unwrap().items, items);
    }

    #[test]
    fn a_chapter_moved_out_becomes_a_text() {
        let (_r, dir) = book();
        let c = add_chapter(&dir, "a b");
        let items = move_converting(&dir, &c, None, 1).unwrap();
        let node = find(&items, &c).unwrap();
        assert_eq!((node.kind, node.status, node.words), (NodeKind::Text, None, None));
        assert_eq!(node.file.as_deref(), Some(format!("arquivos/{c}.md").as_str()));
        assert_eq!(workspace::load_doc(&dir, &c).unwrap(), parse("a b"));
        assert!(!dir.join(format!("capitulos/{c}.md")).exists());
        assert_eq!(items[1].id, c);
    }

    #[test]
    fn missing_chapter_file_converts_to_empty_text() {
        let (_r, dir) = book();
        let c = add_chapter(&dir, "x");
        fs::remove_file(dir.join(format!("capitulos/{c}.md"))).unwrap();
        move_converting(&dir, &c, None, 1).unwrap();
        assert_eq!(workspace::load_doc(&dir, &c).unwrap(), Doc::default());
    }

    #[test]
    fn refused_move_leaves_disk_untouched() {
        let (_r, dir) = book();
        let area_file = dir.join(AREA_DIR).join("area.json");
        let before = fs::read_to_string(&area_file).unwrap();
        let only = chapters(&read_workspace(&dir).unwrap().items)[0].id.clone();
        assert_eq!(move_converting(&dir, &only, None, 1).unwrap_err().0, LAST_CHAPTER);
        let t = workspace::create(&dir, None, 1, NodeKind::Text, "Ana").unwrap().id;
        let before_text = fs::read_to_string(&area_file).unwrap();
        assert_eq!(move_converting(&dir, &t, None, 0).unwrap_err().0, "Nada pode ficar antes do Manuscrito");
        assert_eq!(fs::read_to_string(&area_file).unwrap(), before_text);
        assert_ne!(before, before_text);
    }

    #[test]
    fn a_folder_converts_its_whole_subtree() {
        let (_r, dir) = book();
        let f = workspace::create(&dir, None, 1, NodeKind::Folder, "Parte 2").unwrap().id;
        let t = workspace::create(&dir, Some(&f), 0, NodeKind::Text, "Cena").unwrap().id;
        let items = move_converting(&dir, &f, Some(&manuscript_id(&dir)), 1).unwrap();
        assert_eq!(find(&items, &f).unwrap().kind, NodeKind::Folder);
        assert_eq!(find(&items, &t).unwrap().kind, NodeKind::Chapter);
        assert_eq!(chapters(&items).len(), 2);
    }

    #[test]
    fn plain_moves_stay_as_they_are() {
        let (_r, dir) = book();
        let a = workspace::create(&dir, None, 1, NodeKind::Folder, "A").unwrap().id;
        let t = workspace::create(&dir, None, 2, NodeKind::Text, "T").unwrap().id;
        let items = move_converting(&dir, &t, Some(&a), 0).unwrap();
        assert_eq!(find(&items, &t).unwrap().kind, NodeKind::Text);
        assert_eq!(find(&items, &a).unwrap().children[0].id, t);
    }

    #[test]
    fn words_and_insert_after() {
        let (_r, dir) = book();
        let first = chapters(&read_workspace(&dir).unwrap().items)[0].id.clone();
        add_chapter(&dir, "um dois");
        assert_eq!(book_words(&dir).unwrap(), 2);
        let mut items = read_workspace(&dir).unwrap().items;
        let n = new_chapter(&dir, "", &parse("três")).unwrap();
        let id = n.id.clone();
        insert_after(&mut items, &first, n).unwrap();
        let order: Vec<&str> = chapters(&items).iter().map(|c| c.id.as_str()).collect();
        assert_eq!(order[0], first);
        assert_eq!(order[1], id);
        assert!(insert_after(&mut items, "zz", Node::folder("x".into(), "x")).is_err());
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ops::manuscript`
Expected: compile errors (`new_chapter`, `move_converting`, `insert_after`, `book_words` not found).

- [ ] **Step 3: Add `locate` to `src-tauri/src/model/workspace.rs`**

Below `find_mut`:

```rust
/// Where a node sits: its parent id (None at the root) and its index in that list.
pub fn locate<'a>(items: &'a [Node], id: &str) -> Option<(Option<&'a str>, usize)> {
    fn walk<'a>(list: &'a [Node], parent: Option<&'a str>, id: &str) -> Option<(Option<&'a str>, usize)> {
        if let Some(i) = list.iter().position(|n| n.id == id) {
            return Some((parent, i));
        }
        list.iter().find_map(|n| walk(&n.children, Some(n.id.as_str()), id))
    }
    walk(items, None, id)
}
```

and a test in its module:

```rust
    #[test]
    fn locates_parent_and_index() {
        let t = tree();
        assert_eq!(locate(&t, "c"), Some((Some("a"), 1)));
        assert_eq!(locate(&t, "f"), Some((None, 2)));
        assert_eq!(locate(&t, "zz"), None);
    }
```

- [ ] **Step 4: Write the operations**

Above the tests in `src-tauri/src/ops/manuscript.rs`:

```rust
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::{
    doc::Doc,
    manuscript::{self, in_manuscript},
    metadata::Status,
    workspace::{find, find_mut, insert, locate, move_node, Node, NodeKind},
};
use crate::storage::{
    paths::{area_text_rel, chapter_rel},
    workspace_io::{read_doc_at, read_workspace, remove_file_at, write_doc_at, write_workspace},
};
use crate::text::words::doc_words;

/// Word total of the book's chapters, from the tree on disk.
pub fn book_words(dir: &Path) -> AppResult<usize> {
    Ok(manuscript::total_words(&read_workspace(dir)?.items))
}

/// Writes `doc` as a new chapter file; returns its node (draft, words counted), not yet in the tree.
pub fn new_chapter(dir: &Path, title: &str, doc: &Doc) -> AppResult<Node> {
    let id = new_id();
    let rel = chapter_rel(&id);
    write_doc_at(dir, NodeKind::Chapter, &rel, doc)?;
    let mut node = Node::chapter(id, title, &rel);
    node.words = Some(doc_words(doc));
    Ok(node)
}

/// Inserts `node` right after `after_id`, in the same folder (Enter ×3).
pub fn insert_after(items: &mut Vec<Node>, after_id: &str, node: Node) -> AppResult<()> {
    let (parent, i) = locate(items, after_id)
        .map(|(p, i)| (p.map(str::to_string), i))
        .ok_or_else(|| AppError::msg("Capítulo não encontrado"))?;
    insert(items, parent.as_deref(), i + 1, node)
}

/// Turns every text of the subtree into a chapter (`into`), or every chapter into a text,
/// writing each new file. The old files are collected, to be deleted once the tree is saved.
fn convert(dir: &Path, node: &mut Node, into: bool, old: &mut Vec<(NodeKind, String)>) -> AppResult<()> {
    let from = if into { NodeKind::Text } else { NodeKind::Chapter };
    if node.kind == from {
        if let Some(file) = node.file.clone() {
            let doc = read_doc_at(dir, from, &file)?;
            let (kind, rel) = if into {
                (NodeKind::Chapter, chapter_rel(&node.id))
            } else {
                (NodeKind::Text, area_text_rel(&node.id))
            };
            write_doc_at(dir, kind, &rel, &doc)?;
            old.push((from, file));
            node.kind = kind;
            node.file = Some(rel);
            (node.status, node.words) = if into { (Some(Status::Rascunho), Some(doc_words(&doc))) } else { (None, None) };
        }
    }
    for child in &mut node.children {
        convert(dir, child, into, old)?;
    }
    Ok(())
}

/// Moves `id` under `parent` at `index` under the Manuscrito rules, converting the subtree
/// when it crosses the Manuscrito's edge. Order: new files, tree, then old files — a failure
/// midway duplicates a text, never loses it. The id never changes.
pub fn move_converting(dir: &Path, id: &str, parent: Option<&str>, index: usize) -> AppResult<Vec<Node>> {
    let mut ws = read_workspace(dir)?;
    manuscript::check_move(&ws.items, id, parent, index)?;
    let was_inside = in_manuscript(&ws.items, id);
    let lands_inside = parent.is_some_and(|p| in_manuscript(&ws.items, p));
    let mut items = ws.items.clone();
    move_node(&mut items, id, parent, index)?;
    let mut old = Vec::new();
    if was_inside != lands_inside {
        let node = find_mut(&mut items, id).expect("the node was just moved");
        convert(dir, node, lands_inside, &mut old)?;
    }
    ws.items = items;
    write_workspace(dir, &ws)?;
    for (kind, rel) in &old {
        if let Err(e) = remove_file_at(dir, *kind, rel) {
            eprintln!("could not remove converted file {rel}: {e}");
        }
    }
    debug_assert!(find(&ws.items, id).is_some());
    Ok(ws.items)
}
```

- [ ] **Step 5: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/model/workspace.rs src-tauri/src/ops/manuscript.rs src-tauri/src/ops/mod.rs
git commit -m "feat(ops): convert chapters and texts when crossing the manuscript"
```

---
### Task 4: Chapters through the tree; books load through the migration

This is the switch: after it, Rust finds chapters only in the Manuscrito and every book is migrated when it is loaded. `create_book`, the samples and the Scrivener import still write v1 books until Task 6 — they are migrated on first open, so they keep working (except the Scrivener import *into an open book*, whose chapters land in the legacy list until Task 6 fixes it). The desktop webview only understands the new shapes after Task 8; use the Rust tests until then.

**Files:**
- Modify: `src-tauri/src/model/views.rs` (whole file below)
- Modify: `src-tauri/src/model/patches.rs` (`BookPatch`)
- Rewrite: `src-tauri/src/ops/chapter.rs`
- Rewrite: `src-tauri/src/ops/workspace.rs`
- Modify: `src-tauri/src/ops/book.rs` (`update`, one test)
- Modify: `src-tauri/src/ops/library.rs` (add `summarize`)
- Rewrite: `src-tauri/src/state.rs`
- Rewrite: `src-tauri/src/commands/chapter.rs`, `src-tauri/src/commands/workspace.rs`, `src-tauri/src/commands/library.rs`
- Modify: `src-tauri/src/commands/scrivener.rs`, `src-tauri/src/commands/cloud_backup.rs`, `src-tauri/src/cloud/restore.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Tasks 1–3 (`model::manuscript::*`, `migrate::{open_book, peek_tree}`, `ops::manuscript::{move_converting, new_chapter, insert_after, book_words}`, `chapter_io::{read_at, write_at}`).
- Produces (Tauri commands, camelCase args):
  - `book_open(id) -> BookMeta` where `BookMeta = { id, title, author, open: string|null, updatedAt, dir, cover, header, footer, separator }` (no `chapters`, no `cur`).
  - `book_update(id, patch: { title?, author?, open?, separatorText? }) -> BookMeta` (`open` is not a touch).
  - `chapter_load(bookId, chapterId) -> Doc`; `chapter_save(bookId, chapterId, doc) -> Node`; `chapter_update(bookId, chapterId, patch) -> Node`; `chapter_split(bookId, chapterId, before, after) -> Created { id, items }`; `chapter_neighbor(bookId, chapterId, step: i32) -> string|null`; `chapter_search(bookId, q) -> SearchHit[]` (index = reading order); `chapter_markdown(bookId, chapterId) -> string`.
  - `workspace_create(bookId, parent, index, kind: "folder"|"text"|"chapter", title) -> Created`; `workspace_move` converts across the Manuscrito; `workspace_rename/delete/pick_files` apply the rules.
  - Removed: `chapter_insert`, `chapter_move`, `chapter_delete`, `workspace_to_chapter`, `workspace_from_chapter`.
  - Rust API: `ops::chapter::{load(dir, id), save(dir, meta, id, doc) -> Node, update(dir, meta, id, patch) -> Node, split(dir, meta, id, before, after) -> Created, neighbor(dir, id, step) -> Option<String>, search(dir, q), markdown(dir, id)}`; `ops::library::summarize(dir, meta) -> (BookSummary, usize)`; `Library::{register(dir, id, words), replace(dir, id, words)}`; `BookSummary::from_tree(dir, meta, items)`.

- [ ] **Step 1: Views and patches**

Replace `src-tauri/src/model/views.rs`:

```rust
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
```

In `src-tauri/src/model/patches.rs`, replace `BookPatch`:

```rust
#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookPatch {
    pub title: Option<String>,
    pub author: Option<String>,
    /// Id of the node just opened.
    pub open: Option<String>,
    pub separator_text: Option<String>,
}
```

- [ ] **Step 2: `ops/book.rs` — `open` instead of `cur`**

In `update`, replace the `cur` block with:

```rust
    if let Some(open) = patch.open {
        meta.open = Some(open);
    }
```

and change the doc comment to `/// Applies a patch. Only an \`open\` change leaves \`updated_at\` alone.` Replace the test `cur_is_clamped_and_not_a_touch` with:

```rust
    #[test]
    fn open_is_saved_and_not_a_touch() {
        let root = tempfile::tempdir().unwrap();
        let (dir, mut meta) = create_book(root.path(), "Obra").unwrap();
        meta.updated_at = 5;
        update(&dir, &mut meta, BookPatch { open: Some("n1".into()), ..Default::default() }).unwrap();
        assert_eq!((meta.open.as_deref(), meta.updated_at), (Some("n1"), 5));
        assert_eq!(crate::storage::metadata_io::read_metadata(&dir).unwrap().open.as_deref(), Some("n1"));
    }
```

- [ ] **Step 3: Write the failing chapter tests**

Replace `src-tauri/src/ops/chapter.rs` with the header and tests only (the functions come in Step 5):

```rust
//! Chapters, found through the Manuscrito: text, title/notes/status, Enter ×3, reading
//! order, search and the "copy to publish" markdown.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::{manuscript::chapters, metadata::Status, workspace::NodeKind};
    use crate::ops::{library::create_book, workspace};
    use crate::storage::migrate::open_book;

    fn setup() -> (tempfile::TempDir, std::path::PathBuf, Metadata) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _) = create_book(root.path(), "Obra").unwrap();
        let meta = open_book(&dir).unwrap();
        (root, dir, meta)
    }

    fn order(dir: &Path) -> Vec<String> {
        chapters(&read_workspace(dir).unwrap().items).iter().map(|c| c.id.clone()).collect()
    }

    fn manuscript_id(dir: &Path) -> String {
        read_workspace(dir).unwrap().items[0].id.clone()
    }

    #[test]
    fn save_updates_words_and_persists() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        let node = save(&dir, &mut meta, &id, &parse("um dois três")).unwrap();
        assert_eq!(node.words, Some(3));
        assert_eq!(chapters(&read_workspace(&dir).unwrap().items)[0].words, Some(3));
        assert_eq!(load(&dir, &id).unwrap(), parse("um dois três"));
    }

    #[test]
    fn split_opens_the_new_chapter_right_below_in_the_same_folder() {
        let (_r, dir, mut meta) = setup();
        let m = manuscript_id(&dir);
        let first = order(&dir)[0].clone();
        let part = workspace::create(&dir, Some(&m), 0, NodeKind::Folder, "Parte 1").unwrap().id;
        workspace::move_to(&dir, &first, Some(&part), 0).unwrap();
        let later = workspace::create(&dir, Some(&m), 1, NodeKind::Chapter, "Depois").unwrap().id;
        let created = split(&dir, &mut meta, &first, &parse("antes"), &parse("depois do cursor")).unwrap();
        assert_eq!(order(&dir), vec![first.clone(), created.id.clone(), later]);
        let folder = crate::model::workspace::find(&created.items, &part).unwrap();
        assert_eq!(folder.children[1].id, created.id);
        assert_eq!(meta.open.as_deref(), Some(created.id.as_str()));
        assert_eq!(load(&dir, &first).unwrap(), parse("antes"));
        assert_eq!(load(&dir, &created.id).unwrap(), parse("depois do cursor"));
        let node = crate::model::workspace::find(&created.items, &created.id).unwrap();
        assert_eq!((node.words, node.status), (Some(3), Some(Status::Rascunho)));
    }

    #[test]
    fn failed_split_duplicates_text_instead_of_losing_it() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        save(&dir, &mut meta, &id, &parse("antes depois")).unwrap();
        // A directory where the original's temp file goes makes its overwrite fail.
        std::fs::create_dir_all(dir.join(format!("capitulos/{id}.md.tmp"))).unwrap();
        assert!(split(&dir, &mut meta, &id, &parse("antes"), &parse("depois")).is_err());
        let ids = order(&dir);
        // The new chapter is already in the tree with the `after` text...
        assert_eq!(ids.len(), 2);
        assert_eq!(load(&dir, &ids[1]).unwrap(), parse("depois"));
        // ...and the original still holds everything.
        assert_eq!(load(&dir, &id).unwrap(), parse("antes depois"));
    }

    #[test]
    fn neighbor_follows_reading_order() {
        let (_r, dir, _meta) = setup();
        let m = manuscript_id(&dir);
        let first = order(&dir)[0].clone();
        let second = workspace::create(&dir, Some(&m), 1, NodeKind::Chapter, "").unwrap().id;
        assert_eq!(neighbor(&dir, &first, 1).unwrap().as_deref(), Some(second.as_str()));
        assert_eq!(neighbor(&dir, &first, -1).unwrap(), None);
        assert_eq!(neighbor(&dir, &second, 1).unwrap(), None);
        assert_eq!(neighbor(&dir, "zz", 1).unwrap_err().0, "Capítulo não encontrado");
    }

    #[test]
    fn search_ignores_accents_and_matches_numbers() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        save(&dir, &mut meta, &id, &parse("O coração bate")).unwrap();
        workspace::create(&dir, Some(&manuscript_id(&dir)), 1, NodeKind::Chapter, "").unwrap();
        assert_eq!(search(&dir, "CORACAO").unwrap().len(), 1);
        assert_eq!(search(&dir, "02").unwrap()[0].index, 1);
        assert!(search(&dir, "   ").unwrap().is_empty());
    }

    #[test]
    fn markdown_has_heading() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        update(&dir, &mut meta, &id, ChapterPatch { title: Some("Início".into()), ..Default::default() }).unwrap();
        save(&dir, &mut meta, &id, &parse("Texto")).unwrap();
        assert_eq!(markdown(&dir, &id).unwrap(), "Capítulo 1 — Início\n\nTexto\n");
    }

    #[test]
    fn markdown_strips_attribute_lines() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        save(&dir, &mut meta, &id, &parse("Título\n{: align=center}\n\nTexto simples")).unwrap();
        assert_eq!(markdown(&dir, &id).unwrap(), "Capítulo 1\n\nTítulo\n\nTexto simples\n");
    }

    #[test]
    fn update_persists_notes_and_status() {
        let (_r, dir, mut meta) = setup();
        let id = order(&dir)[0].clone();
        update(&dir, &mut meta, &id, ChapterPatch {
            notes: Some("Minhas notas".into()),
            status: Some(Status::Revisao),
            ..Default::default()
        }).unwrap();
        let c = chapters(&read_workspace(&dir).unwrap().items)[0].clone();
        assert_eq!((c.notes.as_str(), c.status), ("Minhas notas", Some(Status::Revisao)));
    }

    #[test]
    fn other_nodes_are_not_chapters() {
        let (_r, dir, mut meta) = setup();
        let t = workspace::create(&dir, None, 1, NodeKind::Text, "Ana").unwrap().id;
        assert_eq!(load(&dir, &t).unwrap_err().0, "Capítulo não encontrado");
        assert!(save(&dir, &mut meta, &t, &parse("x")).is_err());
    }
}
```

- [ ] **Step 4: Run them to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ops::chapter`
Expected: compile errors (`load`, `save`, `split`, `neighbor`… not found).

- [ ] **Step 5: Write `ops/chapter.rs`**

Above the tests:

```rust
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::ids::now_ms;
use crate::markdown::serialize::serialize_without_attrs;
use crate::model::{
    doc::Doc,
    manuscript,
    metadata::Metadata,
    patches::ChapterPatch,
    views::SearchHit,
    workspace::{find_mut, Node, NodeKind, Workspace},
};
use crate::ops::{manuscript::{insert_after, new_chapter}, workspace::Created};
use crate::storage::{
    chapter_io::{read_at, write_at},
    metadata_io::write_metadata,
    workspace_io::{read_workspace, write_workspace},
};
use crate::text::{normalize::fold, words::{doc_text, doc_words}};

fn missing() -> AppError {
    AppError::msg("Capítulo não encontrado")
}

/// The chapter's book-relative file; any other node is "not found".
fn file_of(ws: &Workspace, id: &str) -> AppResult<String> {
    manuscript::chapter(&ws.items, id).and_then(|c| c.file.clone()).ok_or_else(missing)
}

fn chapter_mut<'a>(ws: &'a mut Workspace, id: &str) -> AppResult<&'a mut Node> {
    find_mut(&mut ws.items, id).filter(|n| n.kind == NodeKind::Chapter).ok_or_else(missing)
}

/// Saves the tree, then marks the book as edited.
fn persist(dir: &Path, meta: &mut Metadata, ws: &Workspace) -> AppResult<()> {
    write_workspace(dir, ws)?;
    meta.updated_at = now_ms();
    write_metadata(dir, meta)
}

pub fn load(dir: &Path, chapter_id: &str) -> AppResult<Doc> {
    read_at(dir, &file_of(&read_workspace(dir)?, chapter_id)?)
}

/// Writes the chapter file and refreshes its word count in the tree.
pub fn save(dir: &Path, meta: &mut Metadata, chapter_id: &str, doc: &Doc) -> AppResult<Node> {
    let mut ws = read_workspace(dir)?;
    write_at(dir, &file_of(&ws, chapter_id)?, doc)?;
    let node = chapter_mut(&mut ws, chapter_id)?;
    node.words = Some(doc_words(doc));
    let out = node.clone();
    persist(dir, meta, &ws)?;
    Ok(out)
}

pub fn update(dir: &Path, meta: &mut Metadata, chapter_id: &str, patch: ChapterPatch) -> AppResult<Node> {
    let mut ws = read_workspace(dir)?;
    let node = chapter_mut(&mut ws, chapter_id)?;
    if let Some(t) = patch.title {
        node.title = t;
    }
    if let Some(n) = patch.notes {
        node.notes = n;
    }
    if let Some(s) = patch.status {
        node.status = Some(s);
    }
    let out = node.clone();
    persist(dir, meta, &ws)?;
    Ok(out)
}

/// Enter ×3: `before` stays in the chapter, `after` opens a new chapter right below it, in
/// the same folder, and becomes the open node. Order: new file, tree, and only then the
/// original is cut — a failure at any step leaves the text duplicated, never lost.
pub fn split(dir: &Path, meta: &mut Metadata, chapter_id: &str, before: &Doc, after: &Doc) -> AppResult<Created> {
    let mut ws = read_workspace(dir)?;
    let file = file_of(&ws, chapter_id)?;
    let node = new_chapter(dir, "", after)?;
    let id = node.id.clone();
    insert_after(&mut ws.items, chapter_id, node)?;
    chapter_mut(&mut ws, chapter_id)?.words = Some(doc_words(before));
    meta.open = Some(id.clone());
    persist(dir, meta, &ws)?;
    write_at(dir, &file, before)?;
    Ok(Created { id, items: ws.items })
}

/// The chapter `step` places away from `chapter_id` in reading order (None past either end).
pub fn neighbor(dir: &Path, chapter_id: &str, step: i32) -> AppResult<Option<String>> {
    let ws = read_workspace(dir)?;
    manuscript::chapter(&ws.items, chapter_id).ok_or_else(missing)?;
    Ok(manuscript::neighbor(&ws.items, chapter_id, step))
}

/// Accent/case-insensitive search in titles, numbers, then bodies, one file at a time.
pub fn search(dir: &Path, query: &str) -> AppResult<Vec<SearchHit>> {
    let q = fold(query.trim());
    if q.is_empty() {
        return Ok(vec![]);
    }
    let ws = read_workspace(dir)?;
    let mut hits = Vec::new();
    for (index, c) in manuscript::chapters(&ws.items).into_iter().enumerate() {
        let number = format!("{:02}", index + 1);
        let found = fold(&c.title).contains(&q)
            || number.starts_with(&q)
            || match &c.file {
                Some(f) => fold(&doc_text(&read_at(dir, f)?)).contains(&q),
                None => false,
            };
        if found {
            hits.push(SearchHit { index, chapter_id: c.id.clone() });
        }
    }
    Ok(hits)
}

/// "Capítulo N — título" plus the chapter markdown, for the clipboard. N follows the reading
/// order. Attribute lines (`{: …}`) are stripped: they are formatting metadata, not text.
pub fn markdown(dir: &Path, chapter_id: &str) -> AppResult<String> {
    let ws = read_workspace(dir)?;
    let file = file_of(&ws, chapter_id)?;
    let n = manuscript::position(&ws.items, chapter_id).ok_or_else(missing)? + 1;
    let title = manuscript::chapter(&ws.items, chapter_id).map(|c| c.title.clone()).unwrap_or_default();
    let head = if title.is_empty() { format!("Capítulo {n}") } else { format!("Capítulo {n} — {title}") };
    Ok(format!("{head}\n\n{}", serialize_without_attrs(&read_at(dir, &file)?)))
}
```

- [ ] **Step 6: Rewrite `ops/workspace.rs`**

Replace the whole file:

```rust
//! Operations on a book's tree: create, rename, move (converting across the Manuscrito),
//! delete, text documents and file imports. Chapter text lives in `ops::chapter`.
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::{
    doc::Doc,
    manuscript,
    workspace::{find, find_mut, insert, remove, subtree_files, Node, NodeKind},
};
use crate::ops::manuscript::{move_converting, new_chapter};
use crate::storage::workspace_io::{
    area_path, copy_into_area, read_node_doc, read_workspace, remove_file_at, write_node_doc, write_workspace,
};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub id: String,
    pub items: Vec<Node>,
}

fn not_found() -> AppError {
    AppError::msg("Item não encontrado")
}

/// Loads the tree, applies `f`, saves it and returns the new items.
fn edit(dir: &Path, f: impl FnOnce(&mut Vec<Node>) -> AppResult<()>) -> AppResult<Vec<Node>> {
    let mut ws = read_workspace(dir)?;
    f(&mut ws.items)?;
    write_workspace(dir, &ws)?;
    Ok(ws.items)
}

/// Discards files the tree no longer references; the tree is already saved.
fn discard(dir: &Path, files: &[(NodeKind, String)]) {
    for (kind, rel) in files {
        if let Err(e) = remove_file_at(dir, *kind, rel) {
            eprintln!("could not remove workspace file {rel}: {e}");
        }
    }
}

fn text_file(dir: &Path, id: &str) -> AppResult<String> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?;
    match (node.kind, &node.file) {
        (NodeKind::Text, Some(f)) => Ok(f.clone()),
        _ => Err(AppError::msg("Este item não é um texto")),
    }
}

fn parent_exists(items: &[Node], parent: Option<&str>) -> AppResult<()> {
    match parent {
        Some(p) if find(items, p).is_none() => Err(not_found()),
        _ => Ok(()),
    }
}

pub fn tree(dir: &Path) -> AppResult<Vec<Node>> {
    Ok(read_workspace(dir)?.items)
}

/// New folder, empty text or empty chapter under `parent` (None = root, never before the Manuscrito).
pub fn create(dir: &Path, parent: Option<&str>, index: usize, kind: NodeKind, title: &str) -> AppResult<Created> {
    let mut id = String::new();
    let items = edit(dir, |items| {
        parent_exists(items, parent)?;
        manuscript::check_create(items, kind, parent)?;
        let index = manuscript::root_index(items, parent, index);
        let node = match kind {
            NodeKind::Folder => Node::folder(new_id(), title),
            NodeKind::Text => {
                let nid = new_id();
                let file = format!("{nid}.md");
                write_node_doc(dir, &file, &Doc::default())?;
                Node::leaf(nid, NodeKind::Text, title, &file)
            }
            NodeKind::Chapter => new_chapter(dir, title, &Doc::default())?,
            _ => return Err(AppError::msg("Use \"Adicionar arquivos\" para imagens e anexos")),
        };
        id = node.id.clone();
        insert(items, parent, index, node)
    })?;
    Ok(Created { id, items })
}

pub fn rename(dir: &Path, id: &str, title: &str) -> AppResult<Vec<Node>> {
    edit(dir, |items| {
        manuscript::check_rename(items, id)?;
        find_mut(items, id).ok_or_else(not_found)?.title = title.to_string();
        Ok(())
    })
}

pub fn set_notes(dir: &Path, id: &str, notes: &str) -> AppResult<Vec<Node>> {
    edit(dir, |items| {
        find_mut(items, id).ok_or_else(not_found)?.notes = notes.to_string();
        Ok(())
    })
}

/// Moves a node; crossing the Manuscrito's edge turns texts into chapters or back.
pub fn move_to(dir: &Path, id: &str, parent: Option<&str>, index: usize) -> AppResult<Vec<Node>> {
    move_converting(dir, id, parent, index)
}

/// Removes the node and its subtree; files go only after the tree is saved.
pub fn delete(dir: &Path, id: &str) -> AppResult<Vec<Node>> {
    let mut files = Vec::new();
    let items = edit(dir, |items| {
        manuscript::check_delete(items, id)?;
        let node = remove(items, id).ok_or_else(not_found)?;
        files = subtree_files(&node);
        Ok(())
    })?;
    discard(dir, &files);
    Ok(items)
}

pub fn load_doc(dir: &Path, id: &str) -> AppResult<Doc> {
    read_node_doc(dir, &text_file(dir, id)?)
}

pub fn save_doc(dir: &Path, id: &str, doc: &Doc) -> AppResult<()> {
    write_node_doc(dir, &text_file(dir, id)?, doc)
}

/// Copies files chosen on disk into the workspace, appended under `parent` (never the Manuscrito).
pub fn import_files(dir: &Path, parent: Option<&str>, paths: &[PathBuf]) -> AppResult<Vec<Node>> {
    let current = read_workspace(dir)?.items;
    parent_exists(&current, parent)?;
    if parent.is_some_and(|p| manuscript::in_manuscript(&current, p)) {
        return Err(AppError::msg(manuscript::NO_MEDIA));
    }
    let mut nodes = Vec::new();
    for src in paths {
        let id = new_id();
        let (rel, kind) = copy_into_area(dir, src, &id)?;
        let title = src.file_stem().and_then(|s| s.to_str()).unwrap_or("Arquivo");
        nodes.push(Node::leaf(id, kind, title, &rel));
    }
    edit(dir, |items| {
        for node in nodes {
            insert(items, parent, usize::MAX, node)?;
        }
        Ok(())
    })
}

/// Absolute path of an image/attachment node (to open it in the default app).
pub fn file_path(dir: &Path, id: &str) -> AppResult<PathBuf> {
    let ws = read_workspace(dir)?;
    let node = find(&ws.items, id).ok_or_else(not_found)?;
    area_path(dir, node.file.as_deref().ok_or_else(not_found)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::manuscript::{chapters, LAST_CHAPTER, NO_MEDIA};
    use crate::model::metadata::Status;
    use crate::ops::library::create_book;
    use crate::storage::{migrate::open_book, paths::AREA_DIR};

    fn book() -> (tempfile::TempDir, PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Obra").unwrap();
        open_book(&dir).unwrap();
        (root, dir)
    }

    fn manuscript_id(dir: &Path) -> String {
        tree(dir).unwrap()[0].id.clone()
    }

    #[test]
    fn the_manuscript_comes_first_with_one_chapter() {
        let (_r, dir) = book();
        let items = tree(&dir).unwrap();
        assert_eq!(items[0].kind, NodeKind::Manuscript);
        assert_eq!(chapters(&items).len(), 1);
    }

    #[test]
    fn create_text_writes_file_and_saves_tree() {
        let (_r, dir) = book();
        // Index 0 at the root lands after the Manuscrito.
        let folder = create(&dir, None, 0, NodeKind::Folder, "Pesquisa").unwrap();
        assert_eq!(folder.items[1].id, folder.id);
        let text = create(&dir, Some(&folder.id), 0, NodeKind::Text, "Ana").unwrap();
        let node = find(&text.items, &text.id).unwrap();
        assert_eq!(node.file.as_deref(), Some(format!("{}.md", text.id).as_str()));
        assert!(dir.join(AREA_DIR).join(node.file.as_ref().unwrap()).exists());
        assert_eq!(tree(&dir).unwrap(), text.items);
        assert!(create(&dir, None, 1, NodeKind::Image, "x").is_err());
    }

    #[test]
    fn chapters_are_created_only_inside_the_manuscript() {
        let (_r, dir) = book();
        let m = manuscript_id(&dir);
        let c = create(&dir, Some(&m), 1, NodeKind::Chapter, "Dois").unwrap();
        let node = find(&c.items, &c.id).unwrap();
        assert_eq!((node.kind, node.status, node.words), (NodeKind::Chapter, Some(Status::Rascunho), Some(0)));
        assert!(dir.join(format!("capitulos/{}.md", c.id)).is_file());
        assert_eq!(create(&dir, None, 1, NodeKind::Chapter, "x").unwrap_err().0, "Capítulos ficam dentro do Manuscrito");
        assert_eq!(create(&dir, Some(&m), 0, NodeKind::Text, "x").unwrap_err().0, "Textos livres ficam fora do Manuscrito");
        assert_eq!(create(&dir, Some("zz"), 0, NodeKind::Folder, "x").unwrap_err().0, "Item não encontrado");
    }

    #[test]
    fn save_and_load_text_roundtrip() {
        let (_r, dir) = book();
        let c = create(&dir, None, 1, NodeKind::Text, "Ana").unwrap();
        let doc = parse("Ela tinha **olhos** cinzentos.");
        save_doc(&dir, &c.id, &doc).unwrap();
        assert_eq!(load_doc(&dir, &c.id).unwrap(), doc);
        let f = create(&dir, None, 1, NodeKind::Folder, "P").unwrap();
        assert!(load_doc(&dir, &f.id).is_err());
    }

    #[test]
    fn delete_folder_removes_subtree_files_after_saving_tree() {
        let (_r, dir) = book();
        let f = create(&dir, None, 1, NodeKind::Folder, "P").unwrap();
        let t = create(&dir, Some(&f.id), 0, NodeKind::Text, "Ana").unwrap();
        let file = dir.join(AREA_DIR).join(format!("{}.md", t.id));
        assert!(file.exists());
        let items = delete(&dir, &f.id).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(tree(&dir).unwrap().len(), 1);
        assert!(!file.exists());
    }

    #[test]
    fn deleting_chapters_removes_their_files_but_never_the_last() {
        let (_r, dir) = book();
        let m = manuscript_id(&dir);
        let only = chapters(&tree(&dir).unwrap())[0].id.clone();
        assert_eq!(delete(&dir, &only).unwrap_err().0, LAST_CHAPTER);
        let c = create(&dir, Some(&m), 1, NodeKind::Chapter, "").unwrap().id;
        let file = dir.join(format!("capitulos/{c}.md"));
        assert!(file.exists());
        delete(&dir, &c).unwrap();
        assert!(!file.exists());
        assert_eq!(delete(&dir, &m).unwrap_err().0, "O Manuscrito não pode ser excluído");
        assert_eq!(rename(&dir, &m, "Livro").unwrap_err().0, "O Manuscrito não pode ser renomeado");
    }

    #[test]
    fn import_files_copies_and_detects_kind() {
        let (root, dir) = book();
        let png = root.path().join("mapa.png");
        std::fs::write(&png, b"not really a png").unwrap();
        let pdf = root.path().join("Artigo.PDF");
        std::fs::write(&pdf, b"%PDF").unwrap();
        assert_eq!(import_files(&dir, Some(&manuscript_id(&dir)), &[png.clone()]).unwrap_err().0, NO_MEDIA);
        let items = import_files(&dir, None, &[png, pdf]).unwrap();
        assert_eq!(items.len(), 3);
        assert_eq!((items[1].kind, items[1].title.as_str()), (NodeKind::Image, "mapa"));
        assert_eq!((items[2].kind, items[2].title.as_str()), (NodeKind::File, "Artigo"));
        assert!(items[2].file.as_ref().unwrap().ends_with(".pdf"));
        assert!(dir.join(AREA_DIR).join(items[2].file.as_ref().unwrap()).exists());
    }

    #[test]
    fn moving_into_the_manuscript_converts() {
        let (_r, dir) = book();
        let t = create(&dir, None, 1, NodeKind::Text, "Prólogo").unwrap().id;
        let items = move_to(&dir, &t, Some(&manuscript_id(&dir)), 0).unwrap();
        assert_eq!(find(&items, &t).unwrap().kind, NodeKind::Chapter);
    }

    #[test]
    fn rename_move_and_missing_ids() {
        let (_r, dir) = book();
        let a = create(&dir, None, 1, NodeKind::Folder, "A").unwrap();
        let b = create(&dir, None, 2, NodeKind::Text, "B").unwrap();
        let items = rename(&dir, &b.id, "Bê").unwrap();
        assert_eq!(find(&items, &b.id).unwrap().title, "Bê");
        let items = move_to(&dir, &b.id, Some(&a.id), 0).unwrap();
        assert_eq!(find(&items, &a.id).unwrap().children[0].id, b.id);
        assert_eq!(rename(&dir, "zz", "x").unwrap_err().0, "Item não encontrado");
    }
}
```

- [ ] **Step 7: `ops/library.rs` — library card through the migration**

Add to the imports of `src-tauri/src/ops/library.rs`:

```rust
use crate::model::{manuscript, views::BookSummary};
use crate::storage::migrate::peek_tree;
```

Add after `scan`:

```rust
/// Library card of a book and its word total. A v1 book is read through an in-memory
/// migration, so listing never writes; an unreadable tree counts as empty.
pub fn summarize(dir: &Path, meta: &Metadata) -> (BookSummary, usize) {
    let items = peek_tree(dir, meta).unwrap_or_else(|e| {
        eprintln!("could not read the tree of {}: {e}", dir.display());
        Vec::new()
    });
    (BookSummary::from_tree(dir, meta, &items), manuscript::total_words(&items))
}
```

Add this test to its module:

```rust
    #[test]
    fn listing_a_v1_book_writes_nothing() {
        let root = tempfile::tempdir().unwrap();
        let dir = root.path().join("antiga");
        fs::create_dir_all(&dir).unwrap();
        let mut entry = ChapterEntry::new("c1".into());
        entry.words = 42;
        write_metadata(&dir, &Metadata::new("b1".into(), "Antiga", vec![entry])).unwrap();
        let meta = read_metadata(&dir).unwrap();
        let (card, words) = summarize(&dir, &meta);
        assert_eq!((card.chapters, card.words, words), (1, 42, 42));
        assert!(!dir.join("area").exists());
        assert!(!dir.join(crate::storage::paths::BACKUP_META_FILE).exists());
    }
```

- [ ] **Step 8: Rewrite `src-tauri/src/state.rs`**

```rust
use std::{collections::HashMap, path::{Path, PathBuf}, sync::{Mutex, MutexGuard}};

use crate::error::{AppError, AppResult};
use crate::model::metadata::Metadata;
use crate::ops::manuscript::book_words;
use crate::storage::migrate::open_book;

/// Runtime state managed by Tauri. Keeps only one book's metadata in memory; its tree is
/// read from disk by each operation.
pub struct Library {
    pub root: PathBuf,
    dirs: HashMap<String, PathBuf>,
    open: Option<(PathBuf, Metadata)>,
    totals: HashMap<String, usize>,
    session_base: Option<usize>,
    /// Words moved out of the chapters this session without being erased; they still count as today's.
    released: usize,
}

pub type SharedLibrary = Mutex<Library>;

pub fn lock(state: &SharedLibrary) -> AppResult<MutexGuard<'_, Library>> {
    state.lock().map_err(|_| AppError::msg("Estado interno indisponível"))
}

impl Library {
    pub fn new(root: PathBuf) -> Self {
        Self { root, dirs: HashMap::new(), open: None, totals: HashMap::new(), session_base: None, released: 0 }
    }

    /// Records a book seen on disk with its word total; the first full scan fixes the
    /// daily-goal baseline. A book first seen after that (new, restored sample, copied folder)
    /// joins the baseline, so only words written in the app count as today's.
    pub fn register(&mut self, dir: &Path, id: &str, words: usize) {
        if let Some(base) = self.session_base.as_mut() {
            if !self.totals.contains_key(id) {
                *base += words;
            }
        }
        // The cached metadata belongs to another folder now: reread it next time.
        if self.open.as_ref().is_some_and(|(d, m)| m.id == id && d != dir) {
            self.open = None;
        }
        self.dirs.insert(id.to_string(), dir.to_path_buf());
        self.totals.insert(id.to_string(), words);
    }

    pub fn start_session_if_needed(&mut self) {
        if self.session_base.is_none() {
            self.session_base = Some(self.totals.values().sum());
        }
    }

    /// Drops a deleted book; its words leave the baseline too, so today is unchanged.
    pub fn forget(&mut self, id: &str) -> Option<PathBuf> {
        if let (Some(total), Some(base)) = (self.totals.remove(id), self.session_base.as_mut()) {
            *base = base.saturating_sub(total);
        }
        if self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            self.open = None;
        }
        self.dirs.remove(id)
    }

    /// The book's folder was replaced by a restored copy. The word difference joins the baseline,
    /// so the restore does not count as words written today.
    pub fn replace(&mut self, dir: &Path, id: &str, words: usize) {
        let old = self.totals.get(id).copied().unwrap_or(0);
        if let Some(base) = self.session_base.as_mut() {
            *base = (*base + words).saturating_sub(old);
        }
        if self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            self.open = None;
        }
        self.dirs.insert(id.to_string(), dir.to_path_buf());
        self.totals.insert(id.to_string(), words);
    }

    pub fn dir_of(&self, id: &str) -> AppResult<PathBuf> {
        self.dirs.get(id).cloned().ok_or_else(|| AppError::msg("Obra não encontrada"))
    }

    /// Runs `f` on the book's cached metadata, loading it (and migrating a v1 book) if needed.
    /// On error the cache is dropped so the next call rereads the disk.
    pub fn with_book<T>(&mut self, id: &str, f: impl FnOnce(&Path, &mut Metadata) -> AppResult<T>) -> AppResult<T> {
        if !self.open.as_ref().is_some_and(|(_, m)| m.id == id) {
            let dir = self.dir_of(id)?;
            let meta = open_book(&dir)?;
            self.open = Some((dir, meta));
        }
        let (dir, meta) = self.open.as_mut().expect("just loaded");
        match f(dir, meta) {
            Ok(out) => {
                match book_words(dir) {
                    Ok(total) => {
                        self.totals.insert(id.to_string(), total);
                    }
                    Err(e) => eprintln!("could not count the words of {id}: {e}"),
                }
                Ok(out)
            }
            Err(e) => {
                self.open = None;
                Err(e)
            }
        }
    }

    pub fn today(&self) -> usize {
        let now: usize = self.totals.values().sum();
        (now + self.released).saturating_sub(self.session_base.unwrap_or(now))
    }

    /// Word total of a book as last seen (0 if unknown).
    pub fn total_of(&self, id: &str) -> usize {
        self.totals.get(id).copied().unwrap_or(0)
    }

    /// Words that entered a book without being typed (import, a text moved into the
    /// Manuscrito) join the session baseline, so today is unchanged.
    pub fn absorb(&mut self, words: usize) {
        if let Some(base) = self.session_base.as_mut() {
            *base += words;
        }
    }

    /// Words that left the chapters without being erased (a chapter moved out of the
    /// Manuscrito) keep counting, so today is unchanged.
    pub fn release(&mut self, words: usize) {
        if self.session_base.is_some() {
            self.released += words;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::markdown::parse::parse;
    use crate::model::manuscript::chapters;
    use crate::ops::{chapter, library::create_book};
    use crate::storage::migrate::peek_tree;

    /// Its first chapter's id: stable through the migration, so valid before and after it.
    fn first_chapter(dir: &Path, meta: &Metadata) -> String {
        chapters(&peek_tree(dir, meta).unwrap())[0].id.clone()
    }

    #[test]
    fn today_counts_words_written_after_session_start() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let c = first_chapter(&dir, &meta);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois")).map(|_| ())).unwrap();
        assert_eq!(lib.today(), 2);
    }

    #[test]
    fn books_added_or_removed_mid_session_do_not_move_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let (dir_b, meta_b) = create_book(root.path(), "B").unwrap();
        lib.register(&dir_b, &meta_b.id, 100);
        assert_eq!(lib.today(), 0);
        let c = first_chapter(&dir, &meta);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois")).map(|_| ())).unwrap();
        assert_eq!(lib.today(), 2);
        lib.forget(&meta_b.id);
        assert_eq!(lib.today(), 2);
    }

    #[test]
    fn replacing_a_book_does_not_move_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        lib.replace(&dir, &meta.id, 500);
        assert_eq!(lib.today(), 0);
        assert_eq!(lib.total_of(&meta.id), 500);
    }

    #[test]
    fn unknown_book_is_an_error() {
        let mut lib = Library::new(PathBuf::from("."));
        assert!(lib.with_book("nope", |_, _| Ok(())).is_err());
    }

    #[test]
    fn loading_a_book_migrates_it() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        let open = lib.with_book(&meta.id, |_, m| Ok(m.open.clone())).unwrap();
        assert_eq!(open, Some(first_chapter(&dir, &meta)));
        let ws = crate::storage::workspace_io::read_workspace(&dir).unwrap();
        assert_eq!(ws.version, 2);
    }

    #[test]
    fn absorbed_words_do_not_count_as_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let c = first_chapter(&dir, &meta);
        let before = lib.total_of(&meta.id);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois três")).map(|_| ())).unwrap();
        lib.absorb(lib.total_of(&meta.id) - before);
        assert_eq!(lib.today(), 0);
    }

    #[test]
    fn released_words_do_not_lower_today() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "A").unwrap();
        let mut lib = Library::new(root.path().to_path_buf());
        lib.register(&dir, &meta.id, 0);
        lib.start_session_if_needed();
        let c = first_chapter(&dir, &meta);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("um dois")).map(|_| ())).unwrap();
        assert_eq!(lib.today(), 2);
        let before = lib.total_of(&meta.id);
        lib.with_book(&meta.id, |d, m| chapter::save(d, m, &c, &parse("")).map(|_| ())).unwrap();
        lib.release(before - lib.total_of(&meta.id));
        assert_eq!(lib.today(), 2);
    }
}
```

- [ ] **Step 9: Commands**

Replace `src-tauri/src/commands/chapter.rs`:

```rust
use tauri::State;

use crate::error::AppResult;
use crate::model::{doc::Doc, patches::ChapterPatch, views::SearchHit, workspace::Node};
use crate::ops::{chapter, workspace::Created};
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn chapter_load(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<Doc> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::load(dir, &chapter_id))
}

#[tauri::command]
pub async fn chapter_save(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String, doc: Doc) -> AppResult<Node> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::save(dir, meta, &chapter_id, &doc))
}

#[tauri::command]
pub async fn chapter_update(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    patch: ChapterPatch,
) -> AppResult<Node> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::update(dir, meta, &chapter_id, patch))
}

#[tauri::command]
pub async fn chapter_split(
    state: State<'_, SharedLibrary>,
    book_id: String,
    chapter_id: String,
    before: Doc,
    after: Doc,
) -> AppResult<Created> {
    lock(&state)?.with_book(&book_id, |dir, meta| chapter::split(dir, meta, &chapter_id, &before, &after))
}

/// Previous (`step` -1) or next (`step` 1) chapter in reading order; null past either end.
#[tauri::command]
pub async fn chapter_neighbor(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String, step: i32) -> AppResult<Option<String>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::neighbor(dir, &chapter_id, step))
}

#[tauri::command]
pub async fn chapter_search(state: State<'_, SharedLibrary>, book_id: String, q: String) -> AppResult<Vec<SearchHit>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::search(dir, &q))
}

#[tauri::command]
pub async fn chapter_markdown(state: State<'_, SharedLibrary>, book_id: String, chapter_id: String) -> AppResult<String> {
    lock(&state)?.with_book(&book_id, |dir, _meta| chapter::markdown(dir, &chapter_id))
}
```

Replace `src-tauri/src/commands/workspace.rs`:

```rust
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

use super::dialog::pick_files;
use crate::error::{AppError, AppResult};
use crate::model::{doc::Doc, workspace::{Node, NodeKind}};
use crate::ops::workspace as ops;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn workspace_tree(state: State<'_, SharedLibrary>, book_id: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::tree(dir))
}

#[tauri::command]
pub async fn workspace_create(
    state: State<'_, SharedLibrary>,
    book_id: String,
    parent: Option<String>,
    index: usize,
    kind: NodeKind,
    title: String,
) -> AppResult<ops::Created> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::create(dir, parent.as_deref(), index, kind, &title))
}

#[tauri::command]
pub async fn workspace_rename(state: State<'_, SharedLibrary>, book_id: String, id: String, title: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::rename(dir, &id, &title))
}

#[tauri::command]
pub async fn workspace_set_notes(state: State<'_, SharedLibrary>, book_id: String, id: String, notes: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::set_notes(dir, &id, &notes))
}

/// Moving across the Manuscrito's edge converts texts ⇄ chapters. Words that enter the
/// chapters were not typed today, and words that leave them were not erased: the daily
/// count stays where it was.
#[tauri::command]
pub async fn workspace_move(
    state: State<'_, SharedLibrary>,
    book_id: String,
    id: String,
    parent: Option<String>,
    index: usize,
) -> AppResult<Vec<Node>> {
    let mut lib = lock(&state)?;
    let before = lib.total_of(&book_id);
    let items = lib.with_book(&book_id, |dir, _meta| ops::move_to(dir, &id, parent.as_deref(), index))?;
    let after = lib.total_of(&book_id);
    if after > before {
        lib.absorb(after - before);
    } else {
        lib.release(before - after);
    }
    Ok(items)
}

#[tauri::command]
pub async fn workspace_delete(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::delete(dir, &id))
}

#[tauri::command]
pub async fn workspace_load_doc(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<Doc> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::load_doc(dir, &id))
}

#[tauri::command]
pub async fn workspace_save_doc(state: State<'_, SharedLibrary>, book_id: String, id: String, doc: Doc) -> AppResult<()> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::save_doc(dir, &id, &doc))
}

#[tauri::command]
pub async fn workspace_pick_files(
    window: WebviewWindow,
    state: State<'_, SharedLibrary>,
    book_id: String,
    parent: Option<String>,
) -> AppResult<Option<Vec<Node>>> {
    // The dialog runs before locking so the state is never held while the user browses.
    let paths = pick_files(&window);
    if paths.is_empty() {
        return Ok(None);
    }
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::import_files(dir, parent.as_deref(), &paths)).map(Some)
}

#[tauri::command]
pub async fn workspace_open_file(app: AppHandle, state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<()> {
    let path = lock(&state)?.with_book(&book_id, |dir, _meta| ops::file_path(dir, &id))?;
    app.opener()
        .open_path(path.to_string_lossy(), None::<&str>)
        .map_err(|_| AppError::msg("Não foi possível abrir o arquivo"))
}
```

Replace `src-tauri/src/commands/library.rs`:

```rust
use tauri::State;

use crate::cloud::CloudState;
use crate::error::AppResult;
use crate::model::{patches::BookPatch, views::{BookSummary, LibraryListing}};
use crate::ops::{book, library as ops};
use crate::state::{lock, Library, SharedLibrary};

fn listing(lib: &mut Library, cloud: &CloudState) -> AppResult<LibraryListing> {
    let first_run = !lib.root.exists();
    std::fs::create_dir_all(&lib.root)?;
    if first_run {
        ops::write_samples(&lib.root)?;
    }
    let root = lib.root.clone();
    let scan = ops::scan(&root)?;
    let books = {
        // Only the in-vault flag is needed per book, so read it once under the guard instead of
        // cloning the whole `CloudFile` (which can hold every enabled book and its snapshot history).
        let g = cloud.lock()?;
        scan.books
            .iter()
            .map(|(dir, meta)| {
                let (card, words) = ops::summarize(dir, meta);
                lib.register(dir, &meta.id, words);
                BookSummary { cloud: g.file.in_vault(&meta.id), ..card }
            })
            .collect()
    };
    lib.start_session_if_needed();
    Ok(LibraryListing { books, warnings: scan.warnings })
}

#[tauri::command]
pub async fn library_list(state: State<'_, SharedLibrary>, cloud: State<'_, CloudState>) -> AppResult<LibraryListing> {
    let mut lib = lock(&state)?;
    listing(&mut lib, &cloud)
}

#[tauri::command]
pub async fn library_create(state: State<'_, SharedLibrary>, title: String) -> AppResult<BookSummary> {
    let mut lib = lock(&state)?;
    std::fs::create_dir_all(&lib.root)?;
    let (dir, meta) = ops::create_book(&lib.root, &title)?;
    let (card, words) = ops::summarize(&dir, &meta);
    lib.register(&dir, &meta.id, words);
    Ok(card)
}

#[tauri::command]
pub async fn library_rename(state: State<'_, SharedLibrary>, id: String, title: String) -> AppResult<BookSummary> {
    let mut lib = lock(&state)?;
    lib.with_book(&id, |dir, meta| {
        book::update(dir, meta, BookPatch { title: Some(title), ..Default::default() })?;
        Ok(ops::summarize(dir, meta).0)
    })
}

#[tauri::command]
pub async fn library_delete(state: State<'_, SharedLibrary>, id: String) -> AppResult<()> {
    let mut lib = lock(&state)?;
    let dir = lib.dir_of(&id)?;
    ops::delete_book(&dir)?;
    lib.forget(&id);
    Ok(())
}

#[tauri::command]
pub async fn library_restore_samples(state: State<'_, SharedLibrary>, cloud: State<'_, CloudState>) -> AppResult<LibraryListing> {
    let mut lib = lock(&state)?;
    std::fs::create_dir_all(&lib.root)?;
    ops::write_samples(&lib.root)?;
    listing(&mut lib, &cloud)
}
```

In `src-tauri/src/commands/scrivener.rs`, in the `ImportTarget::New` arm, replace `lib.register(&dir, &meta);` with:

```rust
            let words = crate::ops::library::summarize(&dir, &meta).1;
            lib.register(&dir, &meta.id, words);
```

In `src-tauri/src/commands/cloud_backup.rs`, replace the body of `cloud_download`:

```rust
    let (dir, meta) = restore::download_new(&app, &book_id).await?;
    Ok(BookSummary { cloud: true, ..crate::ops::library::summarize(&dir, &meta).0 })
```

In `src-tauri/src/cloud/restore.rs`, replace `lib.replace(&dir, &meta);` with

```rust
        let words = crate::ops::library::summarize(&dir, &meta).1;
        lib.replace(&dir, &meta.id, words);
```

and `lib.register(&target, &meta);` with

```rust
        let words = crate::ops::library::summarize(&target, &meta).1;
        lib.register(&target, &meta.id, words);
```

In `src-tauri/src/lib.rs`, in `generate_handler!`, replace the chapter lines with:

```rust
            chapter::chapter_load,
            chapter::chapter_save,
            chapter::chapter_update,
            chapter::chapter_split,
            chapter::chapter_neighbor,
            chapter::chapter_search,
            chapter::chapter_markdown,
```

and delete the lines `workspace::workspace_to_chapter,` and `workspace::workspace_from_chapter,`.

- [ ] **Step 10: Run the whole Rust suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS. If `cargo` reports `ChapterMeta` or `total_words` unused/unknown anywhere, the caller is one of the files above — fix the call to the new API; `Metadata::total_words` stays until Task 6 (the samples test still uses it).

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/model/views.rs src-tauri/src/model/patches.rs src-tauri/src/ops/chapter.rs src-tauri/src/ops/workspace.rs src-tauri/src/ops/book.rs src-tauri/src/ops/library.rs src-tauri/src/state.rs src-tauri/src/commands/chapter.rs src-tauri/src/commands/workspace.rs src-tauri/src/commands/library.rs src-tauri/src/commands/scrivener.rs src-tauri/src/commands/cloud_backup.rs src-tauri/src/cloud/restore.rs src-tauri/src/lib.rs
git commit -m "feat(rust): chapters live in the manuscript tree; books migrate on load"
```

---
### Task 5: Visitors' comments land in the node notes

Public chapter links keep the same `nodeId` (the migration keeps chapter ids), so a thread on a chapter now finds a `chapter` node in the tree. The metadata branch goes away.

**Files:**
- Modify: `src-tauri/src/cloud/comments.rs` (`Target`, `apply`, its test)
- Modify: `src-tauri/src/cloud/inbox.rs` (one call)

**Interfaces:**
- Consumes: `model::manuscript::chapters`, `storage::migrate::open_book` (test).
- Produces: `cloud::comments::apply(dir: &Path, threads: &[Thread], utc_offset_min: i32) -> AppResult<Vec<String>>` (no `meta` parameter).

- [ ] **Step 1: Update the failing test**

In `src-tauri/src/cloud/comments.rs`, replace `writes_to_chapter_node_and_inbox_and_reuses_the_inbox`:

```rust
    #[test]
    fn writes_to_chapter_node_and_inbox_and_reuses_the_inbox() {
        use crate::model::workspace::find;
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "A").unwrap();
        crate::storage::migrate::open_book(&dir).unwrap();
        let chapter = crate::model::manuscript::chapters(&read_workspace(&dir).unwrap().items)[0].id.clone();
        let node = workspace::create(&dir, None, 1, NodeKind::Text, "Ficha").unwrap().id;
        let list = vec![
            comment("r1", None, &chapter, "no capítulo", 1),
            comment("r2", None, &node, "na ficha", 2),
            comment("r3", None, "apagado", "sem destino", 3),
        ];
        let done = apply(&dir, &threads(&list, &[]), 0).unwrap();
        assert_eq!(done, vec!["r1", "r2", "r3"]);
        let ws = read_workspace(&dir).unwrap();
        assert!(find(&ws.items, &chapter).unwrap().notes.contains("no capítulo"));
        assert!(find(&ws.items, &node).unwrap().notes.contains("na ficha"));
        let inbox: Vec<&Node> = ws.items.iter().filter(|n| n.title == INBOX_TITLE).collect();
        assert_eq!(inbox.len(), 1);
        assert!(inbox[0].notes.contains("sem destino"));
        // The inbox is a free text after the Manuscrito, never before it.
        assert_eq!(ws.items[0].kind, NodeKind::Manuscript);

        let more = vec![comment("r4", None, "sumiu", "outro", 4)];
        apply(&dir, &threads(&more, &[]), 0).unwrap();
        let ws = read_workspace(&dir).unwrap();
        let inbox: Vec<&Node> = ws.items.iter().filter(|n| n.title == INBOX_TITLE).collect();
        assert_eq!(inbox.len(), 1);
        assert!(inbox[0].notes.contains("sem destino") && inbox[0].notes.contains("outro"));
    }
```

- [ ] **Step 2: Run it to see it fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml cloud::comments`
Expected: compile error — `apply` takes 4 arguments.

- [ ] **Step 3: Tree-only targets**

In `src-tauri/src/cloud/comments.rs`, change the module doc's first line to `//! Visitors' comments become plain notes: each thread is appended to the notes of its node`, then replace the imports, `Target` and `apply`:

```rust
use std::path::Path;

use super::api::Comment;
use crate::error::AppResult;
use crate::ids::new_id;
use crate::model::{
    doc::Doc,
    workspace::{find_mut, Node, NodeKind, Workspace},
};
use crate::storage::workspace_io::{read_workspace, write_node_doc, write_workspace};
```

```rust
/// Appends each thread to its node's notes (chapter or not) and saves; returns the root ids written.
pub fn apply(dir: &Path, threads: &[Thread], utc_offset_min: i32) -> AppResult<Vec<String>> {
    if threads.is_empty() {
        return Ok(Vec::new());
    }
    let mut ws = read_workspace(dir)?;
    let mut done = Vec::new();
    for t in threads {
        let node_id = t.root.node_id.as_str();
        match find_mut(&mut ws.items, node_id) {
            Some(n) => n.notes = append_note(&n.notes, &format_thread(t, false, utc_offset_min)),
            None => {
                let n = inbox(dir, &mut ws)?;
                n.notes = append_note(&n.notes, &format_thread(t, true, utc_offset_min));
            }
        }
        done.push(t.root.id.clone());
    }
    write_workspace(dir, &ws)?;
    Ok(done)
}
```

Delete the `enum Target { … }` block. `inbox` stays as is (it pushes the inbox at the end of the root, after the Manuscrito).

In `src-tauri/src/cloud/inbox.rs`, replace the call:

```rust
        lock(&app.state::<SharedLibrary>())?
            .with_book(book_id, |dir, _meta| comments::apply(dir, &threads, utc_offset_min))?
```

- [ ] **Step 4: Run the tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cloud/comments.rs src-tauri/src/cloud/inbox.rs
git commit -m "feat(cloud): comments go to the tree node notes, chapters included"
```

---
### Task 6: New books born v2 and the Scrivener import into the Manuscrito

**Files:**
- Modify: `src-tauri/src/ops/library.rs` (`create_book`, `write_samples`, tests)
- Modify: `src-tauri/src/scrivener/import.rs` (chapters become nodes; tests)
- Modify: `src-tauri/src/storage/chapter_io.rs` (drop the `ChapterEntry` wrappers; tests)
- Modify: `src-tauri/src/model/metadata.rs` (drop `total_words`)

**Interfaces:**
- Consumes: `ops::manuscript::new_chapter`, `model::manuscript::{chapters, manuscript_mut}`, `workspace::remove`, `chapter_io::{read_at, delete_at}`.
- Produces: `create_book(root, title) -> AppResult<(PathBuf, Metadata)>` writes `area/area.json` v2 (`[Manuscrito { chapter }]`) and `metadata.json` with `open` = that chapter and no `chapters`; `write_samples` likewise with `open` = the sample's `cur` chapter; `scrivener::import::import_into(project, chapter_items, dir, meta, wrap)` appends chapter nodes at the end of the Manuscrito (same signature); the leftover of the Scrivener Draft (items not marked as chapters) becomes a folder titled "<título do Draft> (Scrivener)".

- [ ] **Step 1: Write the failing library tests**

In the tests of `src-tauri/src/ops/library.rs`, replace `create_then_scan` and `samples_have_word_counts_and_delete_works`, and add `new_books_are_born_v2`:

```rust
    #[test]
    fn create_then_scan() {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Meu Livro").unwrap();
        assert!(dir.ends_with("meu-livro"));
        assert!(dir.join("imagens").is_dir());
        let items = read_workspace(&dir).unwrap().items;
        assert!(dir.join(chapters(&items)[0].file.as_ref().unwrap()).is_file());
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 1);
        assert!(scan.warnings.is_empty());
    }

    #[test]
    fn new_books_are_born_v2() {
        let root = tempfile::tempdir().unwrap();
        let (dir, meta) = create_book(root.path(), "Nova").unwrap();
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.version, 2);
        assert_eq!(ws.items.len(), 1);
        let only = chapters(&ws.items);
        assert_eq!(only.len(), 1);
        assert_eq!(meta.open.as_deref(), Some(only[0].id.as_str()));
        let raw: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("metadata.json")).unwrap()).unwrap();
        assert!(raw.get("chapters").is_none());
        assert!(!dir.join(crate::storage::paths::BACKUP_META_FILE).exists());
    }

    #[test]
    fn samples_have_word_counts_and_delete_works() {
        let root = tempfile::tempdir().unwrap();
        write_samples(root.path()).unwrap();
        let scan = scan(root.path()).unwrap();
        assert_eq!(scan.books.len(), 3);
        assert!(scan.books.iter().all(|(d, _)| crate::ops::manuscript::book_words(d).unwrap() > 0));
        // Each sample opens on its `cur` chapter.
        assert!(scan.books.iter().all(|(d, m)| {
            let items = read_workspace(d).unwrap().items;
            m.open.as_deref().is_some_and(|id| chapters(&items).iter().any(|c| c.id == id))
        }));
        delete_book(&scan.books[0].0).unwrap();
        assert_eq!(super::scan(root.path()).unwrap().books.len(), 2);
    }
```

At the top of that test module add:

```rust
    use crate::model::{manuscript::chapters, metadata::ChapterEntry};
    use crate::storage::workspace_io::read_workspace;
```

- [ ] **Step 2: Run them to see them fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ops::library`
Expected: FAIL — `new_books_are_born_v2` sees version 1 / no items, `create_then_scan` finds no chapter in the tree.

- [ ] **Step 3: Born v2**

In `src-tauri/src/ops/library.rs` replace the imports (keep `summarize` from Task 4) with:

```rust
use std::{collections::HashSet, fs, path::{Path, PathBuf}};

use crate::error::AppResult;
use crate::ids::{new_id, now_ms};
use crate::markdown::parse::parse;
use crate::model::{
    doc::Doc,
    manuscript,
    metadata::Metadata,
    views::BookSummary,
    workspace::{Node, Workspace},
};
use crate::ops::manuscript::new_chapter;
use crate::samples::sample_books;
use crate::storage::{
    metadata_io::{read_metadata, write_metadata},
    migrate::peek_tree,
    paths::{slugify, unique_dir, CHAPTERS_DIR, IMAGES_DIR},
    workspace_io::write_workspace,
};
```

and replace `create_book` and `write_samples`:

```rust
/// Writes a v2 book: the tree (a Manuscrito holding `chapters`) first, then the metadata,
/// opened on chapter `open` (or the first one).
fn write_new_book(dir: &Path, meta: &mut Metadata, chapters: Vec<Node>, open: usize) -> AppResult<()> {
    meta.open = chapters.get(open).or(chapters.first()).map(|c| c.id.clone());
    let mut m = Node::manuscript(new_id());
    m.children = chapters;
    write_workspace(dir, &Workspace { items: vec![m], ..Workspace::default() })?;
    write_metadata(dir, meta)
}

/// Creates the folder tree, a Manuscrito with one empty chapter, and the metadata.
pub fn create_book(root: &Path, title: &str) -> AppResult<(PathBuf, Metadata)> {
    let dir = unique_dir(root, &slugify(title));
    init_book_dirs(&dir)?;
    let chapter = new_chapter(&dir, "", &Doc::default())?;
    let mut meta = Metadata::new(new_id(), title, vec![]);
    write_new_book(&dir, &mut meta, vec![chapter], 0)?;
    Ok((dir, meta))
}
```

```rust
/// Writes the sample books into `root`.
pub fn write_samples(root: &Path) -> AppResult<()> {
    for sample in sample_books() {
        let dir = unique_dir(root, &slugify(sample.title));
        init_book_dirs(&dir)?;
        let mut chapters = Vec::new();
        for c in &sample.chapters {
            let mut node = new_chapter(&dir, c.title, &parse(c.body))?;
            node.status = Some(c.status);
            node.notes = c.notes.to_string();
            chapters.push(node);
        }
        let mut meta = Metadata::new(new_id(), sample.title, vec![]);
        meta.updated_at = now_ms().saturating_sub(sample.age_hours * 3_600_000);
        write_new_book(&dir, &mut meta, chapters, sample.cur)?;
    }
    Ok(())
}
```

In `src-tauri/src/model/metadata.rs` delete `Metadata::total_words` (no caller left).

- [ ] **Step 4: Update the Scrivener tests (they fail next)**

In `src-tauri/src/scrivener/import.rs` tests, replace the `use` lines at the top of the module with:

```rust
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
```

Then change the assertions of these tests (everything else in them stays):

- `realistic_scrivener3_project_imports_clean_text`: replace the two lines from `assert_eq!(meta.chapters[0].title, "Parte I & II");` through `let doc = read_chapter(&book, &meta.chapters[0]).unwrap();` with

```rust
        let list = chapter_list(&book);
        assert_eq!(list[0].0, "Parte I & II");
        let doc = read_at(&book, &list[0].2).unwrap();
```

  change the destructuring `let (book, meta, out) =` to `let (book, _meta, out) =`, and replace `let place = &ws.items[0].children[0].children[0];` with `let place = &ws.items[1].children[0].children[0];`.

- `new_book_gets_chapters_and_workspace`: replace from `assert_eq!(meta.chapters.len(), 2);` to the end of the test with

```rust
        let list = chapter_list(&dir);
        // The imported chapters replace the empty starter.
        assert_eq!(list.len(), 2);
        assert_eq!((list[0].0.as_str(), list[0].1.as_str()), ("Capítulo 1", "Abertura"));
        let d1 = read_at(&dir, &list[0].2).unwrap();
        assert_eq!(d1.content.len(), 3);
        assert_eq!(d1.content[1], Block::Separator);
        assert_eq!(doc_text(&d1), "Primeira cena.\n\nSegunda cena.");
        assert_eq!(list[1].0, "Capítulo 2");
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(meta.open.as_deref(), Some(chapters(&ws.items)[0].id.as_str()));
        let titles: Vec<&str> = ws.items.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(titles, vec!["Manuscrito", "Pesquisa", "Anexos do manuscrito"]);
        assert_eq!(ws.items[0].kind, NodeKind::Manuscript);
        let research = &ws.items[1];
        assert_eq!(research.children.len(), 2); // "Sumiu" has no file: warning, no node
        assert_eq!((research.children[0].kind, research.children[0].notes.as_str()), (NodeKind::Text, "Protagonista"));
        assert_eq!(research.children[1].kind, NodeKind::File);
        assert_eq!(ws.items[2].children[0].kind, NodeKind::Image);
        assert!(!ws.items.iter().any(|n| n.title == "Lixeira"));
```

- `open_book_appends_chapters_and_wraps_workspace`: replace its body after `let out = …` with

```rust
        assert_eq!(out.chapters, 2);
        let list = chapter_list(&dir);
        assert_eq!(list.len(), 3);
        assert_eq!((list[1].0.as_str(), list[2].0.as_str()), ("Capítulo 1", "Capítulo 2"));
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items.len(), 2);
        assert_eq!(ws.items[1].title, "Livro");
        assert_eq!(ws.items[1].children[0].title, "Pesquisa");
```

- `wrap_title_is_trimmed_and_falls_back_when_blank`: `ws.items[0].title` → `ws.items[1].title` and `ws2.items[0].title` → `ws2.items[1].title`.
- `media_with_children_becomes_a_folder_with_itself_and_its_children`: `let pesquisa = &ws.items[0];` → `let pesquisa = &ws.items[1];`.
- `media_inside_chapter_subtree_still_gathers_its_children_text`: change `let (book_dir, meta, out)` to `let (book_dir, _meta, out)`, replace `let doc = read_chapter(&book_dir, &meta.chapters[0]).unwrap();` with `let doc = read_at(&book_dir, &chapter_list(&book_dir)[0].2).unwrap();`, and use `ws.items[1]` instead of `ws.items[0]` in the two last assertions.
- `only_the_chosen_items_become_chapters`: replace from `let titles: Vec<&str> = meta.chapters…` to the end with

```rust
        let list = chapter_list(&dir);
        let titles: Vec<&str> = list.iter().map(|c| c.0.as_str()).collect();
        assert_eq!(titles, vec!["Cena 2", "Ana"]);
        assert_eq!(list[1].1, "Protagonista");
        let ws = read_workspace(&dir).unwrap();
        // What was left of the Draft is a plain folder, named so it is not taken for the Manuscrito.
        let leftover = &ws.items[1];
        assert_eq!((leftover.kind, leftover.title.as_str()), (NodeKind::Folder, "Manuscrito (Scrivener)"));
        let chapter1 = &leftover.children[0];
        assert_eq!(chapter1.title, "Capítulo 1");
        let left: Vec<&str> = chapter1.children.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(left, vec!["Cena 1", "Esboço"]);
        assert_eq!(leftover.children[1].title, "Capítulo 2");
        let research: Vec<&str> = ws.items[2].children.iter().map(|n| n.title.as_str()).collect();
        assert_eq!(research, vec!["Artigo"]);
```

  and change `let (dir, meta, out)` to `let (dir, _meta, out)`.
- `media_and_trash_are_never_chapters`: change `let (_dir, meta, out)` to `let (dir, _meta, out)` and `assert_eq!(meta.chapters.len(), 1);` to `assert_eq!(chapter_list(&dir).len(), 1); // the empty starter stays`.
- `nothing_marked_puts_everything_in_the_workspace`: replace from `assert_eq!(meta.chapters.len(), 1);` to the end with

```rust
        let list = chapter_list(&dir);
        assert_eq!(list.len(), 1);
        assert!(read_at(&dir, &list[0].2).is_ok());
        let ws = read_workspace(&dir).unwrap();
        assert_eq!(ws.items[1].title, "Manuscrito (Scrivener)");
        assert_eq!(ws.items[1].children[0].kind, NodeKind::Folder);
```

  and change `let (dir, meta, out)` to `let (dir, _meta, out)`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml scrivener::import`
Expected: compile errors (`read_at` unused-import is fine; `meta.chapters` gone from the tests) and failures — the import still writes to `meta.chapters`.

- [ ] **Step 5: Import chapter nodes into the Manuscrito**

In `src-tauri/src/scrivener/import.rs`, replace the imports:

```rust
use std::{collections::HashSet, path::{Path, PathBuf}};

use super::{binder::{BinderItem, ItemKind}, project::Project};
use crate::error::{AppError, AppResult};
use crate::ids::{new_id, now_ms};
use crate::model::{
    doc::{Block, Doc},
    manuscript::{chapters, manuscript_mut},
    metadata::Metadata,
    workspace::{remove, Node, NodeKind},
};
use crate::ops::{library::{create_book, delete_book}, manuscript::new_chapter};
use crate::storage::{
    chapter_io::delete_at,
    metadata_io::write_metadata,
    workspace_io::{copy_into_area, read_workspace, write_node_doc, write_workspace},
};
```

Change the module doc's first line to `//! Brings a Scrivener project into a book: each chosen binder item becomes one chapter of the`, the second to `//! Manuscrito (its text plus its descendants'), everything else lands in the rest of the tree.`

In `struct Ctx`, change `chapters: Vec<ChapterEntry>,` to `chapters: Vec<Node>,`.

In `Ctx::node`, in the final `_ =>` arm, replace `let title = title_of(item);` with:

```rust
                let title = title_of(item);
                // The Draft's leftovers must not look like the book's own Manuscrito.
                let folder_title = if item.kind == ItemKind::Draft { format!("{title} (Scrivener)") } else { title.clone() };
```

and `let mut folder = Node::folder(new_id(), &title);` (in that arm) with `let mut folder = Node::folder(new_id(), &folder_title);`. The own-text node keeps `&title`.

Replace `emit_chapter`:

```rust
    /// One chapter node from `item`: its text and every descendant's, in binder order.
    fn emit_chapter(&mut self, item: &BinderItem) -> AppResult<()> {
        let (mut blocks, mut notes) = (Vec::new(), Vec::new());
        self.gather(item, &mut blocks, &mut notes)?;
        let mut node = new_chapter(self.dir, &title_of(item), &Doc::new(blocks))?;
        node.notes = notes.join("\n\n");
        self.chapters.push(node);
        Ok(())
    }
```

Replace `import_into`, `fill_new_book` (keep `import_new_book` as is):

```rust
/// Imports into an existing (v2) book: chapters go to the end of the Manuscrito, in binder
/// order; the other items go into a new folder named `wrap` (or the root when `None`).
pub fn import_into(
    project: &Project,
    chapter_items: &HashSet<String>,
    dir: &Path,
    meta: &mut Metadata,
    wrap: Option<&str>,
) -> AppResult<Outcome> {
    let binder = project.binder()?;
    let mut ctx = Ctx { project, dir, chapter_items, chapters: Vec::new(), attachments: Vec::new(), items: 0, warnings: 0 };
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
    let chapters = ctx.chapters.len();
    if chapters > 0 {
        let m = manuscript_mut(&mut ws.items).ok_or_else(|| AppError::msg("Obra sem Manuscrito"))?;
        m.children.extend(ctx.chapters);
    }
    write_workspace(dir, &ws)?;
    meta.updated_at = now_ms();
    write_metadata(dir, meta)?;
    Ok(Outcome { chapters, items: ctx.items, warnings: ctx.warnings })
}
```

```rust
fn fill_new_book(project: &Project, chapter_items: &HashSet<String>, dir: &Path, meta: &mut Metadata) -> AppResult<Outcome> {
    let starter = chapters(&read_workspace(dir)?.items).first().map(|c| (*c).clone());
    let outcome = import_into(project, chapter_items, dir, meta, None)?;
    // Imported chapters replace the empty starter; with none, it stays so the book is valid.
    if let (Some(starter), true) = (starter, outcome.chapters > 0) {
        let mut ws = read_workspace(dir)?;
        remove(&mut ws.items, &starter.id);
        meta.open = chapters(&ws.items).first().map(|c| c.id.clone());
        write_workspace(dir, &ws)?;
        write_metadata(dir, meta)?;
        if let Some(file) = &starter.file {
            delete_at(dir, file)?;
        }
    }
    Ok(outcome)
}
```

`doc_words` is no longer used in this file: delete `use crate::text::words::doc_words;`.

- [ ] **Step 6: Drop the legacy chapter wrappers**

In `src-tauri/src/storage/chapter_io.rs`, delete the four wrapper functions (`read_chapter_raw`, `read_chapter`, `write_chapter`, `delete_chapter_file`) and the comment above them, change the model import to `use crate::model::doc::Doc;`, and replace the tests module:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::doc::{Block, Inline};

    #[test]
    fn missing_file_reads_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_at(dir.path(), "capitulos/c1.md").unwrap(), Doc::default());
    }

    #[test]
    fn write_read_delete() {
        let dir = tempfile::tempdir().unwrap();
        let doc = Doc::new(vec![Block::paragraph(vec![Inline::text("Oi")])]);
        write_at(dir.path(), "capitulos/c1.md", &doc).unwrap();
        assert_eq!(read_at(dir.path(), "capitulos/c1.md").unwrap(), doc);
        delete_at(dir.path(), "capitulos/c1.md").unwrap();
        delete_at(dir.path(), "capitulos/c1.md").unwrap();
        assert!(!dir.path().join("capitulos/c1.md").exists());
    }

    #[test]
    fn refuses_escaping_file_path() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_at(dir.path(), "../fora.md").is_err());
    }
}
```

`ChapterEntry` itself stays in `model/metadata.rs`: the migration reads it.

- [ ] **Step 7: Run the whole suite**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS, with no `unused` warnings about `ChapterEntry`, `doc_words` or `CHAPTERS_DIR` (the latter is still used by `init_book_dirs`).

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/ops/library.rs src-tauri/src/scrivener/import.rs src-tauri/src/storage/chapter_io.rs src-tauri/src/model/metadata.rs
git commit -m "feat(rust): new books born v2; Scrivener chapters go to the manuscript"
```

---
### Task 7: Front tree helpers for the Manuscrito

Pure reading of the tree Rust sends, for display only (numbers, labels, what can hold children). No behavior change yet.

**Files:**
- Modify: `src/api/types.ts` (`NodeKind`, `AreaNode`)
- Create: `src/lib/manuscript.ts`, `src/lib/manuscript.test.ts`
- Modify: `src/lib/tree.ts`, `src/lib/tree.test.ts`
- Modify: `src/components/workspace/dragMove.ts` (containers)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type NodeKind = "manuscript" | "folder" | "chapter" | "text" | "image" | "file"`; `AreaNode` gains `status?: Status; words?: number`.
  - `lib/manuscript.ts`: `isContainer(kind: NodeKind): boolean`, `manuscriptOf(items: AreaNode[]): AreaNode | null`, `chapterOrder(items: AreaNode[]): AreaNode[]`, `chapterNumber(items: AreaNode[], id: string): number` (1-based, 0 when not a chapter), `inManuscript(items: AreaNode[], id: string): boolean`, `chapterCount(node: AreaNode): number`, `manuscriptWords(items: AreaNode[]): number`, `displayTitle(items: AreaNode[], node: AreaNode): string`.
  - `lib/tree.ts`: `ancestors(items: AreaNode[], id: string | null): string[]`; `dropTarget` refuses dragging the Manuscrito and dropping before it at the root, and accepts "inside" the Manuscrito.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/manuscript.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AreaNode } from "../api/types";
import {
  chapterCount, chapterNumber, chapterOrder, displayTitle, inManuscript, isContainer, manuscriptOf, manuscriptWords,
} from "./manuscript";

const ch = (id: string, words: number, title = ""): AreaNode => ({ id, kind: "chapter", title, notes: "", status: "rascunho", words });
const items: AreaNode[] = [
  { id: "m", kind: "manuscript", title: "Manuscrito", notes: "", children: [
    { id: "p", kind: "folder", title: "Parte 1", notes: "", children: [ch("c1", 10, "Início"), ch("c2", 5)] },
    ch("c3", 1),
  ] },
  { id: "f", kind: "folder", title: "Pesquisa", notes: "", children: [{ id: "t", kind: "text", title: "Ana", notes: "" }] },
];

describe("manuscript helpers", () => {
  it("numbers chapters across parts, depth first", () => {
    expect(chapterOrder(items).map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(chapterNumber(items, "c3")).toBe(3);
    expect(chapterNumber(items, "t")).toBe(0);
    expect(manuscriptWords(items)).toBe(16);
  });

  it("knows the Manuscrito and what lives inside it", () => {
    expect(manuscriptOf(items)?.id).toBe("m");
    expect(manuscriptOf(items.slice(1))).toBeNull();
    expect(inManuscript(items, "c2")).toBe(true);
    expect(inManuscript(items, "m")).toBe(true);
    expect(inManuscript(items, "t")).toBe(false);
    expect(chapterCount(items[0].children![0])).toBe(2);
    expect(isContainer("manuscript") && isContainer("folder")).toBe(true);
    expect(isContainer("chapter")).toBe(false);
  });

  it("shows an untitled chapter by its number", () => {
    expect(displayTitle(items, ch("c1", 0, "Início"))).toBe("Início");
    expect(displayTitle(items, items[0].children![0].children![1])).toBe("Capítulo 2");
    expect(displayTitle(items, { id: "t", kind: "text", title: "", notes: "" })).toBe("");
  });
});
```

Append to `src/lib/tree.test.ts` (inside the file, after the existing `describe`):

```ts
describe("drop rules around the Manuscrito", () => {
  const tree: AreaNode[] = [
    n("m", "manuscript", [n("c1", "chapter"), n("c2", "chapter")]),
    n("f", "folder", [n("t", "text")]),
  ];

  it("never drags the Manuscrito, never drops before it at the root", () => {
    expect(dropTarget(tree, "m", "f", "after")).toBeNull();
    expect(dropTarget(tree, "t", "m", "before")).toBeNull();
    expect(dropTarget(tree, "f", "m", "after")).toEqual({ parent: null, index: 1 });
  });

  it("drops inside the Manuscrito like inside a folder", () => {
    expect(dropTarget(tree, "t", "m", "inside")).toEqual({ parent: "m", index: 2 });
    expect(dropTarget(tree, "t", "c1", "inside")).toBeNull();
  });

  it("lists a node's ancestors, nearest last", () => {
    expect(ancestors(tree, "t")).toEqual(["f"]);
    expect(ancestors(tree, "c2")).toEqual(["m"]);
    expect(ancestors(tree, null)).toEqual([]);
  });
});
```

and change its import line to `import { ancestors, dropTarget, locate, visibleRows } from "./tree";`.

- [ ] **Step 2: Run them to see them fail**

Run: `bun run test src/lib`
Expected: FAIL — `./manuscript` does not exist; `ancestors` is not exported; `"manuscript"` is not a `NodeKind`.

- [ ] **Step 3: Types**

In `src/api/types.ts`, replace `NodeKind` and `AreaNode`:

```ts
export type NodeKind = "manuscript" | "folder" | "chapter" | "text" | "image" | "file";

/**
 * A node of the book's tree. The first root item is the Manuscrito, holding chapters and
 * folders of chapters; the rest are folders, free texts, images and attachments.
 */
export interface AreaNode {
  id: string;
  kind: NodeKind;
  title: string;
  notes: string;
  /** Chapters: relative to the book folder. Other leaves: relative to `area/`. */
  file?: string;
  /** Chapters only. */
  status?: Status;
  /** Chapters only: saved word count. */
  words?: number;
  children?: AreaNode[];
}
```

- [ ] **Step 4: Write `src/lib/manuscript.ts`**

```ts
// Pure reading of the book's tree for display: which kinds hold children, the chapters in
// reading order and their numbers. The rules themselves (what may go where) live in Rust
// (`src-tauri/src/model/manuscript.rs`); the webview only shows the tree it receives.
import type { AreaNode, NodeKind } from "../api/types";
import { findNode } from "./tree";

/** Kinds that hold children. */
export const isContainer = (kind: NodeKind) => kind === "folder" || kind === "manuscript";

/** The Manuscrito: always the first root item. */
export function manuscriptOf(items: AreaNode[]): AreaNode | null {
  return items[0]?.kind === "manuscript" ? items[0] : null;
}

function collect(nodes: AreaNode[], out: AreaNode[]) {
  for (const n of nodes) {
    if (n.kind === "chapter") out.push(n);
    collect(n.children ?? [], out);
  }
}

/** Chapters in reading order: a depth-first walk of the Manuscrito. */
export function chapterOrder(items: AreaNode[]): AreaNode[] {
  const out: AreaNode[] = [];
  const m = manuscriptOf(items);
  if (m) collect(m.children ?? [], out);
  return out;
}

/** 1-based number of chapter `id`; 0 when `id` is not a chapter. */
export function chapterNumber(items: AreaNode[], id: string): number {
  return chapterOrder(items).findIndex((c) => c.id === id) + 1;
}

/** True when `id` is the Manuscrito or sits inside it. */
export function inManuscript(items: AreaNode[], id: string): boolean {
  const m = manuscriptOf(items);
  return !!m && (m.id === id || !!findNode(m.children ?? [], id));
}

/** Chapters in a node's subtree, itself included. */
export function chapterCount(node: AreaNode): number {
  return (node.kind === "chapter" ? 1 : 0) + (node.children ?? []).reduce((a, c) => a + chapterCount(c), 0);
}

/** Saved word total of the chapters. */
export function manuscriptWords(items: AreaNode[]): number {
  return chapterOrder(items).reduce((a, c) => a + (c.words ?? 0), 0);
}

/** Title shown for a node: an untitled chapter reads "Capítulo N". */
export function displayTitle(items: AreaNode[], node: AreaNode): string {
  if (node.title.trim() || node.kind !== "chapter") return node.title;
  return "Capítulo " + chapterNumber(items, node.id);
}
```

- [ ] **Step 5: Drop rules and `ancestors` in `src/lib/tree.ts`**

Add the import at the top (after the type import):

```ts
import { isContainer, manuscriptOf } from "./manuscript";
```

Add after `locate`:

```ts
/** Ids of the folders (and Manuscrito) around `id`, outermost first. */
export function ancestors(items: AreaNode[], id: string | null): string[] {
  const out: string[] = [];
  let loc = id ? locate(items, id) : null;
  while (loc?.parent) {
    out.unshift(loc.parent);
    loc = locate(items, loc.parent);
  }
  return out;
}
```

In `dropTarget`, update the doc comment's last sentence to `Returns \`null\` when \`dragId === targetId\`, when \`dragId\` is the Manuscrito, when \`targetId\` sits inside \`dragId\`'s own subtree, when \`pos\` is "inside" something that holds no children, or when the drop lands before the Manuscrito at the root.` and replace its body:

```ts
  if (dragId === targetId) return null;
  const dragged = findNode(items, dragId);
  const target = findNode(items, targetId);
  if (!dragged || !target || dragged.kind === "manuscript") return null;
  if (pos === "inside" && !isContainer(target.kind)) return null;
  if (findNode(dragged.children ?? [], targetId)) return null;

  const pruned = withoutNode(items, dragId);
  if (pos === "inside") {
    const prunedTarget = findNode(pruned, targetId);
    return prunedTarget ? { parent: targetId, index: prunedTarget.children?.length ?? 0 } : null;
  }
  const loc = locate(pruned, targetId);
  if (!loc) return null;
  const index = pos === "after" ? loc.index + 1 : loc.index;
  // Nothing sits before the Manuscrito (Rust refuses it too).
  if (loc.parent === null && index === 0 && manuscriptOf(pruned)) return null;
  return { parent: loc.parent, index };
```

Change the file's header comment's second line to `// move semantics of the Rust \`model::workspace\` and \`model::manuscript\` modules`.

- [ ] **Step 6: Containers while dragging**

In `src/components/workspace/dragMove.ts`, import `isContainer`:

```ts
import { isContainer } from "../../lib/manuscript";
```

and in `move`, replace the two uses of `node.kind === "folder"`:

```ts
    const pos = dropPosAt(ev.clientY - r.top, r.height, isContainer(node.kind));
    const ok = dropTarget(state.area, id, targetId, pos) !== null;
    setDrag({ dragId: id, targetId: ok ? targetId : null, pos: ok ? pos : null });
    hover(isContainer(node.kind) && !state.areaExpanded.includes(targetId) ? targetId : null);
```

- [ ] **Step 7: Run tests and typecheck**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/api/types.ts src/lib/manuscript.ts src/lib/manuscript.test.ts src/lib/tree.ts src/lib/tree.test.ts src/components/workspace/dragMove.ts
git commit -m "feat(front): tree helpers for the manuscript and its drop rules"
```

---
### Task 8: The book screen — one tree, no tabs

The webview switch: the API speaks the Task 4 shapes, the mock stores v2 trees, the open chapter is the open node of kind `chapter`, the tabs, `ChapterIndex`, `Ctrl 1`/`Ctrl 2` and every index-based chapter action go away, and the book shows the tree on the left and the chapter editor (or a free text, an image, an attachment) on the right. Menus, "+ Novo", collapsing and the theme button come in Tasks 9–11.

**Files:**
- Modify: `src/api/types.ts`, `src/api/chapter.ts`, `src/api/workspace.ts`
- Create: `src/api/mock/manuscript.ts`
- Rewrite: `src/api/mock/db.ts`, `src/api/mock/chapter.ts`, `src/api/mock/workspace.ts`, `src/api/mock/chapter.test.ts`
- Modify: `src/api/mock/book.ts`, `src/api/mock/library.ts`, `src/api/mock/cloud.ts`, `src/api/mock/prefs.ts`
- Modify: `src/lib/types.ts`, `src/store/state.ts`, `src/store/focus.ts`, `src/store/saving.ts`
- Rewrite: `src/store/selectors/book.ts`
- Create: `src/store/actions/expanded.ts`, `src/store/actions/open.ts`
- Rewrite: `src/store/actions/chapters.ts`, `src/store/actions/workspace.ts`, `src/store/actions/chapters.test.ts`
- Modify: `src/store/actions/library.ts`, `src/store/actions/cloud.ts`, `src/store/actions/ui.ts`, `src/store/actions/images.ts`, `src/store/actions/workspace.test.ts`, `src/store/actions/ui.test.ts`, `src/store/actions/cloud.test.ts`
- Rewrite: `src/store/keys/global.ts`; Modify: `src/store/keys/workspace.ts`
- Create: `src/store/commands/chapter.ts`; Modify: `src/store/commands/palette.ts`, `src/store/commands/workspace.ts`
- Modify: `src/App.tsx`, `src/components/chrome/TopBar.tsx`, `src/components/chrome/BottomBar.tsx`, `src/components/chrome/StatusMessage.tsx`, `src/components/editor/Editor.tsx`, `src/components/editor/ChapterLabel.tsx`, `src/components/panels/NotesPanel.tsx`, `src/components/panels/CommandPalette.tsx`, `src/components/cloud/BookCloudSection.tsx`, `src/components/workspace/Workspace.tsx`, `src/components/workspace/NodeView.tsx`, `src/components/workspace/EmptyArea.tsx`, `src/components/workspace/TreeRow.tsx`, `src/components/workspace/WorkspaceTree.tsx`, `src/components/workspace/treeMenu.ts`, `src/components/workspace/dragMove.ts`, `src/styles/global.css`
- Delete: `src/store/actions/tabs.ts`, `src/store/keys/index.ts`, `src/components/panels/ChapterIndex.tsx`

**Interfaces:**
- Consumes: Task 4 commands; Task 7 helpers (`chapterOrder`, `chapterNumber`, `inManuscript`, `manuscriptOf`, `manuscriptWords`, `isContainer`, `displayTitle`, `ancestors`).
- Produces (used by Tasks 9–12):
  - `api/chapter.ts`: `saveChapter(...) -> Promise<AreaNode>`, `updateChapter(...) -> Promise<AreaNode>`, `splitChapter(...) -> Promise<Created>`, `chapterNeighbor(bookId, chapterId, step: -1 | 1) -> Promise<string | null>`.
  - `api/workspace.ts`: `areaCreate(bookId, parent, index, kind: "folder" | "text" | "chapter", title)`.
  - `store/state.ts`: `editNode(id: string, fn: (n: AreaNode) => void)`; `View = "library" | "book"`.
  - `store/selectors/book.ts`: `currentChapter(): AreaNode | null`, `currentNumber(): number`, `bookWordsLive()`, `bookLabel()`, `todayLive()`.
  - `store/actions/expanded.ts`: `expandedFor(bookId, items, openId)`, `toggleExpanded(id)`, `expand(id)`, `reveal(id)`.
  - `store/actions/open.ts`: `selectNode(id | null)`, `openNode(id, focusBody = true)`, `initialNode(items, open)`, `goChapterStep(step: -1 | 1)`, `openFirstChapter()`.
  - `store/actions/chapters.ts`: `refreshToday`, `splitCurrent`, `newChapterAfterCurrent`, `setStatus(id, status)`, `cycleStatus`, `moveChapterStep(dir)`, `copyChapter(id?)`, `setChapterTitle`, `setChapterNotes`, `onEditorChange`.
  - `store/actions/workspace.ts`: `loadArea`, `createNode(kind: "folder" | "text" | "chapter", at?: { parent: string | null; index: number })`, `startNodeRename`, `cancelNodeRename`, `commitNodeRename`, `setNodeNotes`, `deleteNode`, `requestDelete`, `moveTo(id, parent, index)`, `moveNode(dragId, targetId, pos)`, `addFiles`, `openFile`.
  - `store/commands/chapter.ts`: `chapterCommands(): Command[]`, `bookSettingsCommands(): Command[]`.

- [ ] **Step 1: API shapes**

In `src/api/types.ts`, delete `ChapterMeta`, `ToChapterResult` and `FromChapterResult`, and replace `BookMeta`, `SearchHit` and `BookPatch`:

```ts
/** Book-level fields of the open book; its structure comes separately, as the tree. */
export interface BookMeta {
  id: string;
  title: string;
  author: string;
  /** Last opened node (chapter or not). */
  open: string | null;
  updatedAt: number;
  /** Absolute folder; image fields are relative to it. */
  dir: string;
  cover: string | null;
  header: string | null;
  footer: string | null;
  separator: Separator;
}

export interface SearchHit {
  /** Position in reading order. */
  index: number;
  chapterId: string;
}
```

```ts
export type BookPatch = Partial<{ title: string; author: string; open: string; separatorText: string }>;
```

Replace `src/api/chapter.ts`:

```ts
import { call } from "./invoke";
import type { AreaNode, ChapterPatch, Created, DocJSON, SearchHit } from "./types";

export const loadChapter = (bookId: string, chapterId: string) => call<DocJSON>("chapter_load", { bookId, chapterId });
/** Saves the text; resolves to the chapter node with its fresh word count. */
export const saveChapter = (bookId: string, chapterId: string, doc: DocJSON) =>
  call<AreaNode>("chapter_save", { bookId, chapterId, doc });
export const updateChapter = (bookId: string, chapterId: string, patch: ChapterPatch) =>
  call<AreaNode>("chapter_update", { bookId, chapterId, patch });
/** Enter ×3: resolves to the new chapter's id and the tree. */
export const splitChapter = (bookId: string, chapterId: string, before: DocJSON, after: DocJSON) =>
  call<Created>("chapter_split", { bookId, chapterId, before, after });
/** Previous (-1) or next (1) chapter in reading order; null past either end. */
export const chapterNeighbor = (bookId: string, chapterId: string, step: -1 | 1) =>
  call<string | null>("chapter_neighbor", { bookId, chapterId, step });
export const searchChapters = (bookId: string, q: string) => call<SearchHit[]>("chapter_search", { bookId, q });
export const chapterMarkdown = (bookId: string, chapterId: string) => call<string>("chapter_markdown", { bookId, chapterId });
```

In `src/api/workspace.ts`: change the type import to `import type { AreaNode, Created, DocJSON, NodeKind } from "./types";`, replace `areaCreate`:

```ts
/** Creates a folder, an empty text or an empty chapter under `parent` (root when null) at `index`. */
export const areaCreate = (
  bookId: string,
  parent: string | null,
  index: number,
  kind: Extract<NodeKind, "folder" | "text" | "chapter">,
  title: string,
) => call<Created>("workspace_create", { bookId, parent, index, kind, title });
```

and change the doc of `areaMove` to `/** Moves \`id\` under \`parent\` at \`index\` (position after removing it); crossing the Manuscrito converts text ⇄ chapter. */`. Delete `areaToChapter` and `areaFromChapter`.

- [ ] **Step 2: Mock rules — `src/api/mock/manuscript.ts`**

```ts
// Mock copy of the Rust Manuscrito rules (`src-tauri/src/model/manuscript.rs`) and of the
// chapter ⇄ text conversion (`src-tauri/src/ops/manuscript.rs`): same messages, so the
// browser build and the tests refuse exactly what the desktop app refuses.
import type { AreaNode, NodeKind } from "../types";
import { docWords } from "../../lib/doc";
import { chapterCount, chapterOrder, inManuscript, manuscriptOf } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { EMPTY, type MockBook } from "./db";

export const LAST_CHAPTER = "A obra precisa de pelo menos um capítulo";
export const NO_MEDIA = "Imagens e anexos não entram no Manuscrito";

const hasMedia = (n: AreaNode): boolean => n.kind === "image" || n.kind === "file" || (n.children ?? []).some(hasMedia);
const landsInside = (items: AreaNode[], parent: string | null) => !!parent && inManuscript(items, parent);
function takesEveryChapter(items: AreaNode[], node: AreaNode) {
  const n = chapterCount(node);
  return n > 0 && n === chapterOrder(items).length;
}

/** Root position for a new item: never before the Manuscrito. */
export function rootIndex(items: AreaNode[], parent: string | null, index: number) {
  return parent === null && manuscriptOf(items) ? Math.max(index, 1) : index;
}

export function checkRename(items: AreaNode[], id: string) {
  if (manuscriptOf(items)?.id === id) throw "O Manuscrito não pode ser renomeado";
}

export function checkDelete(items: AreaNode[], id: string) {
  const node = findNode(items, id);
  if (!node) return;
  if (node.kind === "manuscript") throw "O Manuscrito não pode ser excluído";
  if (takesEveryChapter(items, node)) throw LAST_CHAPTER;
}

export function checkCreate(items: AreaNode[], kind: NodeKind, parent: string | null) {
  const inside = landsInside(items, parent);
  if (kind === "manuscript") throw "Item inválido";
  if (kind === "chapter" && !inside) throw "Capítulos ficam dentro do Manuscrito";
  if (kind === "text" && inside) throw "Textos livres ficam fora do Manuscrito";
  if ((kind === "image" || kind === "file") && inside) throw NO_MEDIA;
}

export function checkMove(items: AreaNode[], id: string, parent: string | null, index: number) {
  const node = findNode(items, id);
  if (!node) return;
  if (node.kind === "manuscript") throw "O Manuscrito não pode ser movido";
  if (parent === null && index === 0 && manuscriptOf(items)) throw "Nada pode ficar antes do Manuscrito";
  const inside = landsInside(items, parent);
  if (inside && hasMedia(node)) throw NO_MEDIA;
  if (!inside && inManuscript(items, id) && takesEveryChapter(items, node)) throw LAST_CHAPTER;
}

/** Texts of the subtree become chapters (`into`) or chapters become texts; ids and documents stay. */
export function convert(book: MockBook, node: AreaNode, into: boolean) {
  if (node.kind === (into ? "text" : "chapter")) {
    if (into) {
      Object.assign(node, { kind: "chapter", file: "capitulos/" + node.id + ".md", status: "rascunho", words: docWords(book.docs[node.id] ?? EMPTY) });
    } else {
      node.kind = "text";
      node.file = "arquivos/" + node.id + ".md";
      delete node.status;
      delete node.words;
    }
  }
  for (const c of node.children ?? []) convert(book, c, into);
}
```

- [ ] **Step 3: Mock storage — replace `src/api/mock/db.ts`**

```ts
import type { AreaNode, BookMeta, BookSummary, DocJSON, Prefs, Separator, Share, Snapshot, Status } from "../types";
import { docWords } from "../../lib/doc";
import { chapterOrder, manuscriptWords } from "../../lib/manuscript";

/** A mock book: book-level fields, the v2 tree and every document keyed by node id. */
export interface MockBook {
  id: string;
  title: string;
  author: string;
  /** Last opened node. */
  open: string | null;
  updatedAt: number;
  separator: Separator;
  header: string | null;
  footer: string | null;
  /** The Manuscrito (with the chapters) first, then folders, texts, images and attachments. */
  area: AreaNode[];
  /** Documents of chapters and texts; ids never change on conversion, so neither do the keys. */
  docs: Record<string, DocJSON>;
}

let seq = 0;
export const mockId = () => "m" + Date.now().toString(36) + (seq++).toString(36);

export const EMPTY: DocJSON = { type: "doc", content: [] };

export const para = (text: string): DocJSON => ({
  type: "doc",
  content: text.split("\n\n").map((t) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: t }] })),
});

/** A chapter node and its document. */
export function chapter(title: string, status: Status, doc: DocJSON, notes = ""): [AreaNode, DocJSON] {
  const id = mockId();
  return [{ id, kind: "chapter", title, notes, file: "capitulos/" + id + ".md", status, words: docWords(doc) }, doc];
}

/** A v2 book whose Manuscrito holds `chapters`, open on chapter `open`. */
export function mockBook(title: string, chapters: [AreaNode, DocJSON][], open = 0, updatedAt = Date.now()): MockBook {
  const docs: Record<string, DocJSON> = {};
  const nodes = chapters.map(([node, doc]) => {
    docs[node.id] = doc;
    return node;
  });
  return {
    id: mockId(), title, author: "", open: nodes[open]?.id ?? null, updatedAt,
    separator: { type: "text", text: "* * *" }, header: null, footer: null,
    area: [{ id: mockId(), kind: "manuscript", title: "Manuscrito", notes: "", children: nodes }],
    docs,
  };
}

function samples(): MockBook[] {
  const now = Date.now();
  return [
    mockBook("A Torre das Mil Luas", [
      chapter("O sino que não tocava", "pronto", para("Na cidade de Vael, todo mundo sabia que o sino da torre norte não tocava havia cem anos.")),
      chapter("A aprendiz de cartógrafo", "revisao", {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "O mapa de Ilen tinha um erro." }] },
          { type: "separator" },
          { type: "paragraph", content: [{ type: "text", text: "Mestre Odran dizia que mapas não mentem." }] },
        ],
      }),
    ], 1, now - 2 * 3600000),
    mockBook("Herdeira das Cinzas", [chapter("A coroação que não houve", "rascunho", para("A coroa chegou ao salão."))], 0, now - 27 * 3600000),
  ];
}

/** Saved words of a book's chapters. */
export const bookWords = (b: MockBook) => manuscriptWords(b.area);

export const db = { books: samples(), prefs: { theme: "light", goal: 2000, width: 1, font: 1 } as Prefs, base: 0 };
db.base = db.books.reduce((a, b) => a + bookWords(b), 0);

export interface MockCloudBook {
  enabled: boolean;
  lastBackupAt: number | null;
  lastCommentsAt?: number | null;
  snapshots: Snapshot[];
}

/** In-memory vault for the browser build. */
export const cloudDb = {
  apiUrl: "https://kingtimer12.dev/api/scribalis/v1",
  connected: false,
  books: {} as Record<string, MockCloudBook>,
  shares: [] as Share[],
  /** Comments waiting on the server, per book: [nodeId, text]. */
  comments: {} as Record<string, [string, string][]>,
};

export function findBook(id: string): MockBook {
  const b = db.books.find((x) => x.id === id);
  if (!b) throw "Obra não encontrada";
  return b;
}

/** A chapter node of `book`; any other id is Rust's "Capítulo não encontrado". */
export function findChapter(book: MockBook, id: string): AreaNode {
  const c = chapterOrder(book.area).find((x) => x.id === id);
  if (!c) throw "Capítulo não encontrado";
  return c;
}

export const touch = (b: MockBook) => (b.updatedAt = Date.now());

export const toMeta = (b: MockBook): BookMeta => ({
  id: b.id, title: b.title, author: b.author, open: b.open, updatedAt: b.updatedAt, dir: "/mock/" + b.id,
  cover: null, header: b.header, footer: b.footer, separator: b.separator,
});

/** Alias used by `book_open` and by the cloud mock (`cloud_restore`). */
export const toBookMeta = toMeta;

export const toSummary = (b: MockBook): BookSummary => {
  const list = chapterOrder(b.area);
  return {
    id: b.id, title: b.title, author: b.author, cover: null, chapters: list.length, words: bookWords(b),
    ready: list.filter((c) => c.status === "pronto").length, updatedAt: b.updatedAt,
    cloud: !!cloudDb.books[b.id]?.lastBackupAt,
  };
};

export const resetSamples = () => db.books.push(...samples());
```

- [ ] **Step 4: Mock tree commands — replace `src/api/mock/workspace.ts`**

```ts
import type { AreaNode, Created, DocJSON, NodeKind } from "../types";
import { inManuscript, isContainer, manuscriptWords } from "../../lib/manuscript";
import { db, EMPTY, findBook, mockId, touch } from "./db";
import { checkCreate, checkDelete, checkMove, checkRename, convert, NO_MEDIA, rootIndex } from "./manuscript";

// Local tree mutations mirroring the Rust `model::workspace`, `model::manuscript` and
// `ops::manuscript` modules: same messages and move semantics, so the mock behaves like the
// desktop app in `bun run dev` and tests.

function notFound(): never {
  throw "Item não encontrado";
}

function find(items: AreaNode[], id: string): AreaNode | undefined {
  for (const node of items) {
    if (node.id === id) return node;
    const found = find(node.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}

function remove(items: AreaNode[], id: string): AreaNode | undefined {
  const i = items.findIndex((node) => node.id === id);
  if (i >= 0) return items.splice(i, 1)[0];
  for (const node of items) {
    if (!node.children) continue;
    const found = remove(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Inserts `node` under `parent` (root when null) at `index`, like Rust's `workspace::insert`. */
export function insertNode(items: AreaNode[], parent: string | null, index: number, node: AreaNode) {
  let list = items;
  if (parent) {
    const p = find(items, parent);
    if (!p) notFound();
    if (!isContainer(p.kind)) throw "Só dá para guardar itens dentro de pastas";
    p.children ??= [];
    list = p.children;
  }
  list.splice(Math.min(index, list.length), 0, node);
}

/** Moves `id` under `parent` at `index` (position after taking the node out). */
function moveNode(items: AreaNode[], id: string, parent: string | null, index: number) {
  const node = find(items, id);
  if (!node) notFound();
  if (parent) {
    if (parent === id || find(node.children ?? [], parent)) throw "Não dá para mover uma pasta para dentro dela mesma";
    const p = find(items, parent);
    if (!p) notFound();
    if (!isContainer(p.kind)) throw "Só dá para guardar itens dentro de pastas";
  }
  const removed = remove(items, id);
  if (!removed) notFound();
  insertNode(items, parent, index, removed);
}

/** A node's id and all its descendants'. */
function subtreeIds(node: AreaNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(subtreeIds)];
}

function textNode(items: AreaNode[], id: string): AreaNode {
  const node = find(items, id);
  if (!node) notFound();
  if (node.kind !== "text") throw "Este item não é um texto";
  return node;
}

type Ids = { bookId: string; id: string };

export const workspace = {
  workspace_tree: ({ bookId }: { bookId: string }): AreaNode[] => findBook(bookId).area,

  workspace_create: (
    { bookId, parent, index, kind, title }: { bookId: string; parent: string | null; index: number; kind: NodeKind; title: string },
  ): Created => {
    const b = findBook(bookId);
    if (parent && !find(b.area, parent)) notFound();
    checkCreate(b.area, kind, parent);
    const id = mockId();
    let node: AreaNode;
    if (kind === "folder") node = { id, kind, title, notes: "" };
    else if (kind === "text") node = { id, kind, title, notes: "", file: id + ".md" };
    else if (kind === "chapter") node = { id, kind, title, notes: "", file: "capitulos/" + id + ".md", status: "rascunho", words: 0 };
    else throw 'Use "Adicionar arquivos" para imagens e anexos';
    if (kind !== "folder") b.docs[id] = structuredClone(EMPTY);
    insertNode(b.area, parent, rootIndex(b.area, parent, index), node);
    touch(b);
    return { id, items: b.area };
  },

  workspace_rename: ({ bookId, id, title }: Ids & { title: string }): AreaNode[] => {
    const b = findBook(bookId);
    checkRename(b.area, id);
    const node = find(b.area, id);
    if (!node) notFound();
    node.title = title;
    touch(b);
    return b.area;
  },

  workspace_set_notes: ({ bookId, id, notes }: Ids & { notes: string }): AreaNode[] => {
    const b = findBook(bookId);
    const node = find(b.area, id);
    if (!node) notFound();
    node.notes = notes;
    touch(b);
    return b.area;
  },

  workspace_move: ({ bookId, id, parent, index }: Ids & { parent: string | null; index: number }): AreaNode[] => {
    const b = findBook(bookId);
    checkMove(b.area, id, parent, index);
    const wasInside = inManuscript(b.area, id);
    const landsInside = !!parent && inManuscript(b.area, parent);
    const before = manuscriptWords(b.area);
    moveNode(b.area, id, parent, index);
    if (wasInside !== landsInside) convert(b, find(b.area, id)!, landsInside);
    // Moved, neither typed nor erased: today's count stays (Rust's `absorb` / `release`).
    db.base += manuscriptWords(b.area) - before;
    touch(b);
    return b.area;
  },

  workspace_delete: ({ bookId, id }: Ids): AreaNode[] => {
    const b = findBook(bookId);
    checkDelete(b.area, id);
    const removed = remove(b.area, id);
    if (!removed) notFound();
    for (const nid of subtreeIds(removed)) delete b.docs[nid];
    touch(b);
    return b.area;
  },

  workspace_load_doc: ({ bookId, id }: Ids): DocJSON => {
    const b = findBook(bookId);
    textNode(b.area, id);
    return b.docs[id] ?? EMPTY;
  },

  workspace_save_doc: ({ bookId, id, doc }: Ids & { doc: DocJSON }): void => {
    const b = findBook(bookId);
    textNode(b.area, id);
    b.docs[id] = structuredClone(doc);
    touch(b);
  },

  // No file system in the browser: mirrors the desktop-only guard in `commands::workspace`.
  workspace_pick_files: ({ bookId, parent }: { bookId: string; parent: string | null }): AreaNode[] | null => {
    if (parent && inManuscript(findBook(bookId).area, parent)) throw NO_MEDIA;
    throw "Adicionar arquivos só funciona no app desktop";
  },
  workspace_open_file: (_: Ids): void => {
    throw "Abrir arquivos só funciona no app desktop";
  },
};
```

(`mockInvoke` already returns a `structuredClone` of every result, so handlers may return live objects.)

- [ ] **Step 5: Mock chapters, books, library, cloud, prefs**

Replace `src/api/mock/chapter.ts`:

```ts
import type { AreaNode, ChapterPatch, Created, DocJSON, SearchHit } from "../types";
import { docText, docWords } from "../../lib/doc";
import { norm, pad } from "../../lib/format";
import { chapterOrder } from "../../lib/manuscript";
import { locate } from "../../lib/tree";
import { chapter as newChapter, EMPTY, findBook, findChapter, touch } from "./db";
import { insertNode } from "./workspace";

type Ids = { bookId: string; chapterId: string };

export const chapter = {
  chapter_load: ({ bookId, chapterId }: Ids): DocJSON => {
    const b = findBook(bookId);
    findChapter(b, chapterId);
    return b.docs[chapterId] ?? EMPTY;
  },
  chapter_save: ({ bookId, chapterId, doc }: Ids & { doc: DocJSON }): AreaNode => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    b.docs[chapterId] = structuredClone(doc);
    c.words = docWords(doc);
    touch(b);
    return c;
  },
  chapter_update: ({ bookId, chapterId, patch }: Ids & { patch: ChapterPatch }): AreaNode => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    Object.assign(c, patch);
    touch(b);
    return c;
  },
  chapter_split: ({ bookId, chapterId, before, after }: Ids & { before: DocJSON; after: DocJSON }): Created => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    const loc = locate(b.area, chapterId)!;
    const [node, doc] = newChapter("", "rascunho", structuredClone(after));
    b.docs[node.id] = doc;
    insertNode(b.area, loc.parent, loc.index + 1, node);
    b.docs[chapterId] = structuredClone(before);
    c.words = docWords(before);
    b.open = node.id;
    touch(b);
    return { id: node.id, items: b.area };
  },
  chapter_neighbor: ({ bookId, chapterId, step }: Ids & { step: number }): string | null => {
    const list = chapterOrder(findBook(bookId).area);
    const i = list.findIndex((c) => c.id === chapterId);
    if (i < 0) throw "Capítulo não encontrado";
    return list[i + step]?.id ?? null;
  },
  chapter_search: ({ bookId, q }: { bookId: string; q: string }): SearchHit[] => {
    const query = norm(q.trim());
    if (!query) return [];
    const b = findBook(bookId);
    return chapterOrder(b.area)
      .map((c, index) => ({ c, index }))
      .filter(({ c, index }) =>
        norm(c.title).includes(query) || pad(index + 1).startsWith(query) || norm(docText(b.docs[c.id] ?? EMPTY)).includes(query))
      .map(({ c, index }) => ({ index, chapterId: c.id }));
  },
  chapter_markdown: ({ bookId, chapterId }: Ids): string => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    const n = chapterOrder(b.area).indexOf(c) + 1;
    return (c.title ? `Capítulo ${n} — ${c.title}` : `Capítulo ${n}`) + "\n\n" + docText(b.docs[chapterId] ?? EMPTY);
  },
};
```

In `src/api/mock/book.ts`, replace the `cur` line of `book_update` with:

```ts
    // Opening a node is not an edit: no touch.
    if (patch.open !== undefined) b.open = patch.open;
```

Replace `library_create` in `src/api/mock/library.ts` (and its import line):

```ts
import type { BookSummary, LibraryListing } from "../types";
import { chapter, db, findBook, mockBook, resetSamples, toSummary, touch } from "./db";
```

```ts
  library_create: ({ title }: { title: string }): BookSummary => {
    const b = mockBook(title, [chapter("", "rascunho", { type: "doc", content: [] })]);
    db.books.unshift(b);
    return toSummary(b);
  },
```

In `src/api/mock/cloud.ts`, add `import { findNode } from "../../lib/tree";` and replace the loop body of `cloud_fetch_comments`:

```ts
    for (const [nodeId, text] of waiting) {
      // Chapter or not, a comment goes to its node's notes (Rust's `cloud::comments::apply`).
      const n = findNode(book.area, nodeId);
      if (n) n.notes = (n.notes.trim() ? n.notes.trim() + "\n\n" : "") + "— Visitante · " + text;
    }
```

Replace `src/api/mock/prefs.ts`:

```ts
import type { Prefs, PrefsPatch } from "../types";
import { bookWords, db } from "./db";

export const prefs = {
  prefs_get: (): Prefs => ({ ...db.prefs }),
  prefs_set: ({ patch }: { patch: PrefsPatch }): Prefs => Object.assign(db.prefs, patch),
  stats_today: () => ({ today: Math.max(0, db.books.reduce((a, b) => a + bookWords(b), 0) - db.base) }),
};
```

- [ ] **Step 6: Mock tests — replace `src/api/mock/chapter.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { mockInvoke } from ".";
import type { AreaNode, BookMeta, BookSummary, Created, DocJSON } from "../types";
import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";

const doc = (t: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

async function newBook() {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Nova" });
  const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
  const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id });
  return { book, tree, m: tree[0].id, first: chapterOrder(tree)[0].id };
}

describe("mock chapter commands", () => {
  it("a new book opens on its only chapter, inside the Manuscrito", async () => {
    const { book, tree, first } = await newBook();
    expect(tree[0].kind).toBe("manuscript");
    expect(book.open).toBe(first);
  });

  it("split keeps before and opens after right below, in the same folder", async () => {
    const { book, m, first } = await newBook();
    const part = await mockInvoke<Created>("workspace_create", { bookId: book.id, parent: m, index: 0, kind: "folder", title: "Parte" });
    await mockInvoke("workspace_move", { bookId: book.id, id: first, parent: part.id, index: 0 });
    const out = await mockInvoke<Created>("chapter_split", { bookId: book.id, chapterId: first, before: doc("a"), after: doc("b c") });
    expect(findNode(out.items, part.id)!.children!.map((c) => c.id)).toEqual([first, out.id]);
    expect(findNode(out.items, out.id)!.words).toBe(2);
    expect(await mockInvoke<DocJSON>("chapter_load", { bookId: book.id, chapterId: first })).toEqual(doc("a"));
    expect((await mockInvoke<BookMeta>("book_open", { id: book.id })).open).toBe(out.id);
  });

  it("never deletes the last chapter nor the Manuscrito", async () => {
    const { book, m, first } = await newBook();
    await expect(mockInvoke("workspace_delete", { bookId: book.id, id: first })).rejects.toBe("A obra precisa de pelo menos um capítulo");
    await expect(mockInvoke("workspace_delete", { bookId: book.id, id: m })).rejects.toBe("O Manuscrito não pode ser excluído");
  });

  it("a text moved in becomes a chapter and back, keeping id and text", async () => {
    const { book, m } = await newBook();
    const t = await mockInvoke<Created>("workspace_create", { bookId: book.id, parent: null, index: 1, kind: "text", title: "Ana" });
    await mockInvoke("workspace_save_doc", { bookId: book.id, id: t.id, doc: doc("um dois") });
    let tree = await mockInvoke<AreaNode[]>("workspace_move", { bookId: book.id, id: t.id, parent: m, index: 1 });
    expect(findNode(tree, t.id)).toMatchObject({ kind: "chapter", status: "rascunho", words: 2 });
    expect(await mockInvoke<DocJSON>("chapter_load", { bookId: book.id, chapterId: t.id })).toEqual(doc("um dois"));
    tree = await mockInvoke<AreaNode[]>("workspace_move", { bookId: book.id, id: t.id, parent: null, index: 1 });
    expect(findNode(tree, t.id)!.kind).toBe("text");
    expect(findNode(tree, t.id)!.status).toBeUndefined();
  });

  it("neighbor follows reading order", async () => {
    const { book, m, first } = await newBook();
    const second = await mockInvoke<Created>("workspace_create", { bookId: book.id, parent: m, index: 1, kind: "chapter", title: "" });
    expect(await mockInvoke("chapter_neighbor", { bookId: book.id, chapterId: first, step: 1 })).toBe(second.id);
    expect(await mockInvoke("chapter_neighbor", { bookId: book.id, chapterId: first, step: -1 })).toBeNull();
  });
});
```

Run: `bun run test src/api`
Expected: PASS (the store still fails to typecheck; that is fixed in the next steps).

- [ ] **Step 7: Store basics**

`src/lib/types.ts`:

```ts
export type { Prefs, Status } from "../api/types";
export type View = "library" | "book";
export type Panel = "palette" | "notes" | "help" | "spacing" | "cloud";
```

In `src/store/focus.ts`, delete the line `  | "index"` from `FocusTarget`.

In `src/store/state.ts`:
1. Add `import { findNode } from "../lib/tree";` after the constants import.
2. In `AppState`, replace the `book` doc with `/** Book-level fields of the open book; its structure is \`area\`. */`, delete the `// index` comment with `indexSel` and `indexConfirm`, and replace the doc of `areaOpen` with `/** Node shown in the main pane: a chapter or text in the editor, or an image/attachment preview. */` and the `// workspace ("area")` comment with `// the book's tree`.
3. In the initial store, delete `indexSel: 0,` and `indexConfirm: null,`.
4. Append:

```ts
/** Mutates a node of the open book's tree in place; no-op when it is gone. */
export function editNode(id: string, fn: (node: AreaNode) => void) {
  setState(
    produce((s) => {
      const n = findNode(s.area, id);
      if (n) fn(n);
    }),
  );
}
```

Replace `src/store/selectors/book.ts`:

```ts
import type { AreaNode } from "../../api/types";
import { fmt, plural } from "../../lib/format";
import { chapterNumber, chapterOrder } from "../../lib/manuscript";
import { state } from "../state";
import { openAreaNode } from "./workspace";

/** The chapter open in the editor, when the open node is one. */
export const currentChapter = (): AreaNode | null => {
  const n = openAreaNode();
  return n?.kind === "chapter" ? n : null;
};

/** Reading-order number of the open chapter; 0 when none is open. */
export const currentNumber = () => {
  const c = currentChapter();
  return c ? chapterNumber(state.area, c.id) : 0;
};

/** Book total, using the live count for the open chapter. */
export const bookWordsLive = () =>
  chapterOrder(state.area).reduce((a, c) => a + (c.id === state.areaOpen ? state.liveWords : (c.words ?? 0)), 0);

/** "3 capítulos · 1.234 na obra" label. */
export const bookLabel = () =>
  plural(chapterOrder(state.area).length, "capítulo", "capítulos") + " · " + fmt(bookWordsLive()) + " na obra";

/** Daily progress: saved total from Rust plus unsaved typing in the open chapter. */
export const todayLive = () => {
  const c = currentChapter();
  return Math.max(0, state.today + (c ? state.liveWords - (c.words ?? 0) : 0));
};
```

In `src/store/saving.ts`:
1. Replace the state import with `import { editNode, setState, state } from "./state";` and add `import { currentChapter } from "./selectors/book";`.
2. Replace `target()`:

```ts
function target() {
  const b = state.book;
  const c = currentChapter();
  return b && c ? { bookId: b.id, chapterId: c.id } : null;
}
```

3. In `saveDocNow`, replace the `editBook(...)` call with:

```ts
  if (state.book?.id === key.bookId) editNode(key.docId, (n) => (n.words = saved.words));
```

- [ ] **Step 8: Expanded folders — `src/store/actions/expanded.ts`**

```ts
import type { AreaNode } from "../../api/types";
import { manuscriptOf } from "../../lib/manuscript";
import { ancestors } from "../../lib/tree";
import { setState, state } from "../state";

const storageKey = (bookId: string) => "area-expanded:" + bookId;

/** Folders remembered as expanded for this book; null when nothing was saved. Never throws. */
function load(bookId: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(bookId));
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function save(bookId: string, expanded: string[]) {
  setState("areaExpanded", expanded);
  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(expanded));
  } catch {
    // ignore: nothing worth surfacing to the user over a remembered UI preference
  }
}

/** Expanded folders when a book opens: the remembered ones (the Manuscrito the first time), plus the path to `openId`. */
export function expandedFor(bookId: string, items: AreaNode[], openId: string | null): string[] {
  const m = manuscriptOf(items);
  const base = load(bookId) ?? (m ? [m.id] : []);
  return [...new Set([...base, ...ancestors(items, openId)])];
}

export function toggleExpanded(id: string) {
  const b = state.book;
  if (!b) return;
  const set = new Set(state.areaExpanded);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  save(b.id, [...set]);
}

/** Expands the folders around `id` (and `id` itself with `self`), so its row or its content shows. */
export function reveal(id: string, self = false) {
  const b = state.book;
  if (!b) return;
  const want = [...ancestors(state.area, id), ...(self ? [id] : [])];
  if (want.every((x) => state.areaExpanded.includes(x))) return;
  save(b.id, [...new Set([...state.areaExpanded, ...want])]);
}

/** Opens folder `id` and the folders around it. */
export const expand = (id: string) => reveal(id, true);
```

- [ ] **Step 9: Opening nodes — `src/store/actions/open.ts`**

```ts
import * as bookApi from "../../api/book";
import * as chapterApi from "../../api/chapter";
import type { AreaNode, DocJSON } from "../../api/types";
import { loadAreaDoc } from "../../api/workspace";
import { currentDocKey, sameKey, type DocKey } from "../../editor/bridge";
import { docWords } from "../../lib/doc";
import { chapterOrder, isContainer } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { focusTarget } from "../focus";
import { flushAll, settleDocSave, swapDocument } from "../saving";
import { currentChapter } from "../selectors/book";
import { setState, state } from "../state";
import { reveal, toggleExpanded } from "./expanded";
import { flash, flashError } from "./ui";

async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    flashError(e);
  }
}

/** Selects a node; a deletion armed for another node is dropped. */
export function selectNode(id: string | null) {
  setState({ areaSel: id, areaConfirm: state.areaConfirm === id ? id : null });
}

/** The editor key of a chapter or text; null for everything else. */
export function keyOf(bookId: string, node: AreaNode): DocKey | null {
  if (node.kind === "chapter") return { bookId, docId: node.id, scope: "chapter" };
  if (node.kind === "text") return { bookId, docId: node.id, scope: "area" };
  return null;
}

/** The document of a chapter or text. */
export function loadNodeDoc(bookId: string, node: AreaNode): Promise<DocJSON> {
  return node.kind === "chapter" ? chapterApi.loadChapter(bookId, node.id) : loadAreaDoc(bookId, node.id);
}

/** Where a book opens: the remembered node when it still exists and is not a folder, else the first chapter. */
export function initialNode(items: AreaNode[], open: string | null): AreaNode | null {
  const n = open ? findNode(items, open) : null;
  if (n && !isContainer(n.kind)) return n;
  return chapterOrder(items)[0] ?? null;
}

/** Remembers the open node in Rust (not an edit); a failure only costs the next reopening. */
function remember(bookId: string, id: string) {
  if (state.book?.id === bookId) setState("book", "open", id);
  bookApi.updateBook(bookId, { open: id }).catch(() => {});
}

/**
 * Opens a node in the main pane (a folder or the Manuscrito toggles instead). `focusBody`
 * moves the caret into an opened chapter or text; mouse clicks in the tree pass false so a
 * double click can still reach the rename field.
 */
export function openNode(id: string, focusBody = true) {
  const b = state.book;
  const node = findNode(state.area, id);
  if (!b || !node) return;
  selectNode(id);
  if (isContainer(node.kind)) return toggleExpanded(id);
  const key = keyOf(b.id, node);
  if (!key) {
    // The editor unmounts: land any pending text first, or its save would find no editor.
    return run(async () => {
      await flushAll();
      await settleDocSave();
      if (state.book?.id !== b.id) return;
      setState({ areaOpen: id, tripleHint: false });
      remember(b.id, id);
    });
  }
  if (state.areaOpen === id && sameKey(currentDocKey(), key)) {
    // Already in the editor: reloading would only drop its undo history.
    if (focusBody) focusTarget("body");
    return;
  }
  return run(async () => {
    await flushAll();
    const doc = await loadNodeDoc(b.id, node);
    const shown = await swapDocument(doc, key, () => {
      if (state.book?.id !== b.id) return false;
      setState({ areaOpen: id, tripleHint: false, ...(node.kind === "chapter" ? { liveWords: docWords(doc) } : {}) });
    });
    if (!shown) return;
    remember(b.id, id);
    if (focusBody) focusTarget("body", "end");
  });
}

/** Alt ↑ / Alt ↓: previous or next chapter in reading order, across parts. */
export function goChapterStep(step: -1 | 1) {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  return run(async () => {
    const next = await chapterApi.chapterNeighbor(b.id, c.id, step);
    if (!next) {
      flash(step < 0 ? "Este é o primeiro capítulo" : "Este é o último capítulo");
      return;
    }
    reveal(next);
    await openNode(next);
  });
}

/** After the open node went away: the first chapter, or nothing. */
export async function openFirstChapter() {
  setState("areaOpen", null);
  const first = chapterOrder(state.area)[0];
  if (first) await openNode(first.id, false);
}
```

- [ ] **Step 10: Chapter actions — replace `src/store/actions/chapters.ts`**

```ts
import * as api from "../../api/chapter";
import { statsToday } from "../../api/prefs";
import type { Created, DocJSON, Status } from "../../api/types";
import { areaMove } from "../../api/workspace";
import { liveText, type DocKey } from "../../editor/bridge";
import { STATUS, STATUS_LABEL } from "../../lib/constants";
import { docWords } from "../../lib/doc";
import { pad, wc } from "../../lib/format";
import { chapterNumber } from "../../lib/manuscript";
import { findNode, locate } from "../../lib/tree";
import { focusTarget } from "../focus";
import { cancelDocSave, flushAll, scheduleChapterPatch, scheduleDocSave, swapDocument } from "../saving";
import { currentChapter } from "../selectors/book";
import { editNode, setState, state } from "../state";
import { flash, flashError } from "./ui";
import { createNode } from "./workspace";

export async function refreshToday() {
  setState("today", (await statsToday()).today);
}

async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    flashError(e);
  }
}

/** Enter ×3 from the editor: the text after the caret opens a new chapter right below, in the same folder. */
export function splitCurrent(before: DocJSON, after: DocJSON) {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  // The split itself persists both halves of the current text.
  cancelDocSave();
  return run(async () => {
    await flushAll();
    let created: Created;
    try {
      created = await api.splitChapter(b.id, c.id, before, after);
    } catch (e) {
      // Nothing was split: the editor still holds the whole text, save it as usual.
      scheduleDocSave();
      throw e;
    }
    const { id, items } = created;
    const key: DocKey = { bookId: b.id, docId: id, scope: "chapter" };
    const shown = await swapDocument(after, key, () => {
      if (state.book?.id !== b.id) return false;
      setState({ area: items, areaOpen: id, areaSel: id, liveWords: docWords(after), tripleHint: false });
      setState("book", "open", id);
    });
    if (!shown) return;
    focusTarget("title", 0);
    await refreshToday();
    flash("Capítulo " + pad(chapterNumber(state.area, id)) + " criado" + (after.content.length ? " — o texto seguinte foi junto" : ""));
  });
}

/** A new empty chapter right after the open one, in the same folder. */
export function newChapterAfterCurrent() {
  const c = currentChapter();
  const loc = c ? locate(state.area, c.id) : null;
  if (!loc) return;
  return createNode("chapter", { parent: loc.parent, index: loc.index + 1 });
}

export function setStatus(id: string, status: Status) {
  const b = state.book;
  if (!b) return;
  editNode(id, (n) => (n.status = status));
  api.updateChapter(b.id, id, { status }).catch(flashError);
  flash("Status: " + STATUS_LABEL[status]);
}

export function cycleStatus() {
  const c = currentChapter();
  if (!c) return;
  const cur = c.status ?? "rascunho";
  setStatus(c.id, STATUS[(STATUS.indexOf(cur) + 1) % STATUS.length]);
}

/** Alt Shift ↑ / ↓: moves the open chapter one place among its siblings. */
export function moveChapterStep(dir: -1 | 1) {
  const b = state.book;
  const c = currentChapter();
  const loc = c ? locate(state.area, c.id) : null;
  if (!b || !c || !loc) return;
  const siblings = (loc.parent ? findNode(state.area, loc.parent)?.children : state.area) ?? [];
  const to = loc.index + dir;
  if (to < 0 || to >= siblings.length) {
    flash(dir < 0 ? "Já é o primeiro desta pasta" : "Já é o último desta pasta");
    return;
  }
  return run(async () => {
    await flushAll();
    setState("area", await areaMove(b.id, c.id, loc.parent, to));
    flash("Agora é o capítulo " + pad(chapterNumber(state.area, c.id)));
  });
}

/** "Copiar para publicar": the heading plus the markdown of chapter `id` (the open one by default). */
export async function copyChapter(id = currentChapter()?.id) {
  const b = state.book;
  if (!b || !id) return;
  try {
    await flushAll();
    await navigator.clipboard.writeText(await api.chapterMarkdown(b.id, id));
    flash("Capítulo copiado");
  } catch {
    flash("Não foi possível copiar aqui");
  }
}

export function setChapterTitle(title: string) {
  const c = currentChapter();
  if (!c) return;
  editNode(c.id, (n) => (n.title = title));
  scheduleChapterPatch({ title });
}

export function setChapterNotes(notes: string) {
  const c = currentChapter();
  if (!c) return;
  editNode(c.id, (n) => (n.notes = notes));
  scheduleChapterPatch({ notes });
}

/** Called by the chapter editor on every change: live count + debounced save. */
export function onEditorChange() {
  setState("liveWords", wc(liveText()));
  scheduleDocSave();
}
```

- [ ] **Step 11: Tree actions — replace `src/store/actions/workspace.ts`**

```ts
import * as api from "../../api/workspace";
import type { AreaNode } from "../../api/types";
import { currentDocKey } from "../../editor/bridge";
import { pad } from "../../lib/format";
import { chapterNumber, isContainer } from "../../lib/manuscript";
import { dropTarget, findNode, locate, type DropPos } from "../../lib/tree";
import { focusTarget } from "../focus";
import { cancelDocSave, flushAll } from "../saving";
import { setState, state } from "../state";
import { expand } from "./expanded";
import { openFirstChapter, openNode } from "./open";
import { flash, flashError } from "./ui";

/** Runs a mutating tree action; a stale id reloads the tree instead of showing an error. */
async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (e === "Item não encontrado") {
      await loadArea();
      return;
    }
    flashError(e);
  }
}

/** Where a new node (created or imported) lands: the selected folder, or the parent of the selected item. */
function parentForNewItem(): string | null {
  const sel = state.areaSel;
  if (!sel) return null;
  const node = findNode(state.area, sel);
  if (node && isContainer(node.kind)) return sel;
  return locate(state.area, sel)?.parent ?? null;
}

/** True when `target` is `id` or sits inside its subtree. */
function insideSubtree(root: AreaNode | null, id: string, target: string): boolean {
  return target === id || (!!root && !!findNode(root.children ?? [], target));
}

export async function loadArea() {
  const b = state.book;
  if (!b) return;
  try {
    const items = await api.areaTree(b.id);
    if (state.book?.id === b.id) setState("area", items);
  } catch (e) {
    flashError(e);
  }
}

/**
 * Creates a node in the selected folder (or at `at`). A chapter opens on its title; a folder
 * or text enters rename in the tree.
 */
export function createNode(kind: "folder" | "text" | "chapter", at?: { parent: string | null; index: number }) {
  const b = state.book;
  if (!b) return;
  const parent = at ? at.parent : parentForNewItem();
  const siblings = (parent ? findNode(state.area, parent)?.children : state.area) ?? [];
  const index = at ? at.index : siblings.length;
  const title = kind === "folder" ? "Nova pasta" : kind === "text" ? "Novo documento" : "";
  return run(async () => {
    const { id, items } = await api.areaCreate(b.id, parent, index, kind, title);
    setState({ area: items, areaSel: id, areaConfirm: null });
    if (parent) expand(parent);
    if (kind !== "chapter") return startNodeRename(id);
    await openNode(id, false);
    focusTarget("title", 0);
    flash("Capítulo " + pad(chapterNumber(state.area, id)) + " criado");
  });
}

export function startNodeRename(id: string) {
  const node = findNode(state.area, id);
  if (!node || node.kind === "manuscript") return;
  setState({ areaRenaming: id, areaRenameVal: node.title });
}

export function cancelNodeRename() {
  setState({ areaRenaming: null, areaRenameVal: "" });
}

export function commitNodeRename() {
  const b = state.book;
  const id = state.areaRenaming;
  const val = state.areaRenameVal.trim();
  setState({ areaRenaming: null, areaRenameVal: "" });
  if (!b || !id || !val) return;
  return run(async () => {
    await flushAll();
    setState("area", await api.areaRename(b.id, id, val));
  });
}

/** Saves a node's notes; the UI calls this on change, so no debounce is needed here. */
export function setNodeNotes(id: string, notes: string) {
  const b = state.book;
  const node = findNode(state.area, id);
  if (!b || !node || node.notes === notes) return;
  return run(async () => {
    setState("area", await api.areaSetNotes(b.id, id, notes));
  });
}

export function deleteNode(id: string) {
  if (state.areaConfirm !== id) {
    setState("areaConfirm", id);
    return;
  }
  const b = state.book;
  if (!b) return;
  setState("areaConfirm", null);
  const node = findNode(state.area, id);
  return run(async () => {
    await flushAll();
    const key = currentDocKey();
    if (key && insideSubtree(node, id, key.docId)) cancelDocSave();
    setState("area", await api.areaDelete(b.id, id));
    if (state.areaSel && insideSubtree(node, id, state.areaSel)) setState("areaSel", null);
    if (state.areaOpen && insideSubtree(node, id, state.areaOpen)) await openFirstChapter();
  });
}

/** Delete with confirmation: the first request arms it and says how to confirm, the second deletes. */
export function requestDelete(id: string) {
  const node = findNode(state.area, id);
  if (!node) return;
  if (state.areaConfirm === id) return deleteNode(id);
  void deleteNode(id);
  flash("Aperte Delete de novo para excluir «" + node.title + "»");
}

/**
 * Moves `id` under `parent` at `index`. Across the Manuscrito's edge Rust converts text ⇄
 * chapter; when that changes the open node's kind, it is reopened in the right editor.
 */
export function moveTo(id: string, parent: string | null, index: number) {
  const b = state.book;
  if (!b) return;
  const openId = state.areaOpen;
  const openKind = openId ? findNode(state.area, openId)?.kind : undefined;
  return run(async () => {
    // Pending text lands under its current kind before the node changes kind.
    await flushAll();
    setState("area", await api.areaMove(b.id, id, parent, index));
    if (parent) expand(parent);
    const now = openId ? findNode(state.area, openId) : null;
    if (openId && now && now.kind !== openKind) {
      cancelDocSave();
      setState("areaOpen", null);
      await openNode(openId, false);
    }
  });
}

/** Drag and drop in the tree. */
export function moveNode(dragId: string, targetId: string, pos: DropPos) {
  const target = dropTarget(state.area, dragId, targetId, pos);
  if (!target) return;
  return moveTo(dragId, target.parent, target.index);
}

export function addFiles() {
  const b = state.book;
  if (!b) return;
  const parent = parentForNewItem();
  return run(async () => {
    const items = await api.areaPickFiles(b.id, parent);
    if (items) setState("area", items);
  });
}

export function openFile(id: string) {
  const b = state.book;
  if (!b) return;
  return run(() => api.areaOpenFile(b.id, id));
}
```

- [ ] **Step 12: Library, cloud, ui and images actions**

In `src/store/actions/library.ts`:
1. Replace the imports of `chapterApi` and `docWords` with:

```ts
import { areaTree } from "../../api/workspace";
import { docWords } from "../../lib/doc";
import { expandedFor } from "./expanded";
import { initialNode, keyOf, loadNodeDoc } from "./open";
```

2. Replace `openBook`:

```ts
export async function openBook(id: string, target: "title" | "body" = "body") {
  const prev = state.book?.id;
  try {
    await flushAll();
    const book = await bookApi.openBook(id);
    const items = await areaTree(id);
    const node = initialNode(items, book.open);
    const key = node ? keyOf(id, node) : null;
    const doc = node && key ? await loadNodeDoc(id, node) : null;
    const apply = () =>
      batch(() => {
        setState({
          book, curId: id, view: "book", panel: null, q: "", tripleHint: false, focus: false,
          libConfirm: null, renaming: null, liveWords: node?.kind === "chapter" && doc ? docWords(doc) : 0,
          // the tree's screen state belongs to the previous book
          area: items, areaExpanded: expandedFor(id, items, node?.id ?? null), areaSel: node?.id ?? null,
          areaOpen: node?.id ?? null, areaRenaming: null, areaRenameVal: "", areaConfirm: null,
        });
      });
    if (doc && key) await swapDocument(doc, key, apply);
    else {
      // Nothing to load into the editor: land pending text before it unmounts.
      await settleDocSave();
      apply();
    }
    if (prev && prev !== id) backupAuto(prev);
    setState("cloudBook", null);
    void loadBookCloud(id).then((view) => {
      if (view?.enabled) void fetchComments(true);
    });
    if (target === "title" && node?.kind === "chapter") focusTarget("title", 0);
    else focusTarget(doc ? "body" : "tree", doc ? "end" : null);
  } catch (e) {
    flashError(e);
  }
}
```

In `src/store/actions/cloud.ts`: delete `import * as bookApi from "../../api/book";`, change the state import to `import { setState, state } from "../state";`, and replace `reloadNotes`:

```ts
/** Copies fresh notes (chapters and other nodes alike) into the open book's tree. */
async function reloadNotes(bookId: string) {
  await flushAll();
  const items = await areaTree(bookId);
  if (state.book?.id === bookId) setState("area", items);
}
```

In `src/store/actions/ui.ts`, replace `homeTarget`, `closePanel` and `openPanel`:

```ts
/** Where focus rests on the current screen: the library grid, the text, or the tree. */
export function homeTarget(): FocusTarget {
  if (state.view === "library") return "lib";
  const kind = openAreaNode()?.kind;
  return kind === "chapter" || kind === "text" ? "body" : "tree";
}

/** Closes any panel and returns focus to the main screen. */
export function closePanel() {
  focusTarget(homeTarget());
  if (!state.panel) return;
  setState({ panel: null, q: "", pIdx: 0, confirmDel: false, prompt: null, hits: [] });
}

/** Opens a panel; closes it if already open. */
export function openPanel(name: Panel) {
  if (state.panel === name) return closePanel();
  focusTarget(name, name === "notes" ? "end" : null);
  setState({ panel: name, q: "", pIdx: 0, confirmDel: false, prompt: null, hits: [] });
}
```

In `src/store/actions/images.ts`, add `import { currentChapter } from "../selectors/book";` and in `dropChapterImages` replace `if (!id || state.view !== "editor") return;` with `if (!id || !currentChapter()) return;`. In `insertChapterImage` (the Ctrl Shift I action), add the same guard right after reading `id`: `if (!id || !currentChapter()) return;` (replacing its `if (!id) return;`).

Delete `src/store/actions/tabs.ts` and `src/store/keys/index.ts`:

```bash
git rm src/store/actions/tabs.ts src/store/keys/index.ts
```

- [ ] **Step 13: Keys**

Replace `src/store/keys/global.ts`:

```ts
import { cycleStatus, moveChapterStep } from "../actions/chapters";
import { insertChapterImage } from "../actions/images";
import { goLibrary } from "../actions/library";
import { goChapterStep } from "../actions/open";
import { toggleTheme } from "../actions/prefs";
import { closePanel, openPanel, toggleFocusMode } from "../actions/ui";
import { currentChapter } from "../selectors/book";
import { openAreaNode } from "../selectors/workspace";
import { state } from "../state";

/**
 * Global shortcuts. Lives on `window`, so it runs after field/panel handlers,
 * which can call stopPropagation to keep a key for themselves.
 */
export function rootKey(e: KeyboardEvent) {
  // The Scrivener import dialog is modal: it handles its own keys.
  if (state.scrivener) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = (e.key || "").toLowerCase();
  const code = e.code || "";
  const inBook = !!state.book && state.view === "book";
  const chapter = inBook && !!currentChapter();
  const withNotes = inBook && (chapter || openAreaNode()?.kind === "text");
  let handled = true;

  if (mod && (k === "k" || code === "KeyK")) openPanel("palette");
  else if (mod && !e.shiftKey && (k === "j" || code === "KeyJ")) toggleTheme();
  else if (mod && (k === "/" || k === "?" || code === "Slash" || code === "IntlRo" || code === "NumpadDivide")) openPanel("help");
  else if (inBook && mod && (k === "o" || code === "KeyO")) goLibrary();
  else if (mod && e.shiftKey && (k === "s" || code === "KeyS")) openPanel("cloud");
  else if (inBook && mod && (k === "." || code === "Period")) toggleFocusMode();
  else if (withNotes && mod && (k === ";" || code === "Semicolon")) openPanel("notes");
  else if (chapter && mod && e.shiftKey && (k === "i" || code === "KeyI")) void insertChapterImage();
  else if (chapter && e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.shiftKey) void moveChapterStep(dir);
    else void goChapterStep(dir);
  } else if (chapter && e.altKey && !mod && code === "KeyS") cycleStatus();
  else if (e.key === "Escape") closePanel();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
```

In `src/store/keys/workspace.ts`, replace the imports:

```ts
import { isContainer } from "../../lib/manuscript";
import { visibleRows, type Row } from "../../lib/tree";
import { toggleExpanded } from "../actions/expanded";
import { openNode, selectNode } from "../actions/open";
import { createNode, requestDelete, startNodeRename } from "../actions/workspace";
import { setState, state } from "../state";
```

and in `treeKey` replace the three `row?.node.kind === "folder"` checks with `row && isContainer(row.node.kind)` (the `ArrowRight` case, and both conditions of the `ArrowLeft` case keep their other parts: `if (row && isContainer(row.node.kind) && expanded(row.node.id)) toggleExpanded(row.node.id);`).

- [ ] **Step 14: Palette commands**

Create `src/store/commands/chapter.ts`:

```ts
import { insertSeparator } from "../../editor/bridge";
import { FONT_LABEL, STATUS_LABEL, WIDTH_LABEL } from "../../lib/constants";
import { fmt, pad } from "../../lib/format";
import { setBookAuthor, setSeparatorText } from "../actions/book";
import { copyChapter, cycleStatus, moveChapterStep, newChapterAfterCurrent } from "../actions/chapters";
import { backupNow, fetchComments } from "../actions/cloud";
import { clearBookImage, insertChapterImage, pickBookImage, pickCover } from "../actions/images";
import { goChapterStep } from "../actions/open";
import { cycleFont, cycleGoal, cycleWidth } from "../actions/prefs";
import { openPanel } from "../actions/ui";
import { currentChapter, currentNumber } from "../selectors/book";
import { setState, state } from "../state";
import { formatCommands } from "./format";
import type { Command } from "./palette";
import { promptFor } from "./prompt";

/** Frame, separator, cover and author: book settings that only make sense while writing a chapter. */
export function bookSettingsCommands(): Command[] {
  const b = state.book!;
  const sep = b.separator;
  return [
    { label: "Autor da obra" + (b.author ? ": " + b.author : "…"), hint: "", keep: true, act: () => promptFor("Autor", b.author, setBookAuthor) },
    {
      label: "Separador: texto" + (sep.type === "text" ? " (" + sep.text + ")" : "…"), hint: "", keep: true,
      act: () => promptFor("Separador", sep.type === "text" ? sep.text : "* * *", setSeparatorText),
    },
    { label: "Separador: imagem…", hint: "", act: () => pickBookImage("separator") },
    { label: "Moldura superior: escolher imagem", hint: "", act: () => pickBookImage("header") },
    ...(b.header ? [{ label: "Moldura superior: remover", hint: "", act: () => clearBookImage("header") }] : []),
    { label: "Moldura inferior: escolher imagem", hint: "", act: () => pickBookImage("footer") },
    ...(b.footer ? [{ label: "Moldura inferior: remover", hint: "", act: () => clearBookImage("footer") }] : []),
    { label: "Inserir imagem no capítulo", hint: "Ctrl Shift I", act: insertChapterImage },
    { label: "Inserir separador", hint: "Ctrl Enter", act: insertSeparator },
    { label: "Capa da obra", hint: "", act: () => pickCover(b.id) },
  ];
}

/** Palette items for the open chapter; the tree's and the common ones are appended by the palette. */
export function chapterCommands(): Command[] {
  const c = currentChapter();
  if (!state.book || !c) return [];
  const status = c.status ?? "rascunho";
  const share = () => {
    setState("shareDraft", { kind: "chapter", target: c.id, label: "Capítulo " + pad(currentNumber()) });
    openPanel("cloud");
  };
  return [
    { label: "Novo capítulo depois deste", hint: "Enter ×3", act: () => void newChapterAfterCurrent() },
    { label: "Notas do capítulo", hint: "Ctrl ;", act: () => openPanel("notes") },
    { label: state.focus ? "Sair do modo foco" : "Modo foco", hint: "Ctrl .", act: () => setState("focus", !state.focus) },
    { label: "Mudar status  (" + STATUS_LABEL[status] + ")", hint: "Alt S", act: cycleStatus },
    { label: "Capítulo anterior", hint: "Alt ↑", act: () => void goChapterStep(-1) },
    { label: "Próximo capítulo", hint: "Alt ↓", act: () => void goChapterStep(1) },
    { label: "Mover capítulo para cima", hint: "Alt Shift ↑", act: () => void moveChapterStep(-1) },
    { label: "Mover capítulo para baixo", hint: "Alt Shift ↓", act: () => void moveChapterStep(1) },
    { label: "Copiar capítulo para publicar", hint: "", act: () => void copyChapter() },
    { label: "Compartilhar capítulo", hint: "", act: share },
    ...(state.cloudBook?.enabled
      ? [
          { label: "Fazer backup agora", hint: "", act: () => void backupNow() },
          { label: "Buscar comentários", hint: "", act: () => void fetchComments(false) },
        ]
      : []),
    { label: "Meta diária: " + fmt(state.prefs.goal) + " palavras", hint: "", act: cycleGoal },
    { label: "Largura do texto: " + WIDTH_LABEL[state.prefs.width], hint: "", act: cycleWidth },
    { label: "Tamanho da letra: " + FONT_LABEL[state.prefs.font], hint: "", act: cycleFont },
    ...formatCommands(),
    ...bookSettingsCommands(),
  ];
}
```

Replace `src/store/commands/workspace.ts`:

```ts
import { goLibrary } from "../actions/library";
import { startScrivenerImport } from "../actions/scrivener";
import { addFiles, createNode, deleteNode, startNodeRename } from "../actions/workspace";
import { focusTarget } from "../focus";
import { openAreaNode, selectedAreaNode } from "../selectors/workspace";
import { state } from "../state";
import { formatCommands } from "./format";
import type { Command } from "./palette";

/** Imports a Scrivener project into the open book. */
function importIntoBook() {
  const id = state.book?.id;
  if (id) void startScrivenerImport({ type: "book", id });
}

/** Palette items for the book's tree (the chapter and common ones are added by the palette). */
export function workspaceCommands(): Command[] {
  const sel = selectedAreaNode();
  const list: Command[] = [
    { label: "Novo documento", hint: "N", act: () => void createNode("text") },
    { label: "Nova pasta", hint: "Shift N", act: () => void createNode("folder") },
    { label: "Adicionar arquivos…", hint: "", act: () => void addFiles() },
    { label: "Importar do Scrivener…", hint: "", act: () => importIntoBook() },
  ];
  if (sel && sel.kind !== "manuscript") {
    const id = sel.id;
    list.push({ label: "Renomear «" + sel.title + "»", hint: "F2", act: () => startNodeRename(id) });
    list.push(
      state.areaConfirm === id
        ? { label: "Confirmar: excluir «" + sel.title + "»?", hint: "Enter", danger: true, act: () => void deleteNode(id) }
        : { label: "Excluir «" + sel.title + "»", hint: "Del", danger: true, keep: true, act: () => void deleteNode(id) },
    );
  }
  list.push({ label: "Renomear obra", hint: "", act: () => focusTarget("book", "end") });
  list.push({ label: "Voltar às obras", hint: "Ctrl O", act: goLibrary });
  if (openAreaNode()?.kind === "text") list.push(...formatCommands());
  return list;
}
```

Replace `src/store/commands/palette.ts`:

```ts
import { chapterOrder } from "../../lib/manuscript";
import { fmt, norm, pad } from "../../lib/format";
import { clearCover, pickCover } from "../actions/images";
import { openBook, restoreSamples, startNew, startRename } from "../actions/library";
import { reveal } from "../actions/expanded";
import { openNode } from "../actions/open";
import { toggleTheme } from "../actions/prefs";
import { homeTarget, openPanel } from "../actions/ui";
import { startScrivenerImport } from "../actions/scrivener";
import { installUpdate } from "../actions/update";
import { focusTarget } from "../focus";
import { libList, libSelIndex } from "../selectors/library";
import { setState, state } from "../state";
import { chapterCommands } from "./chapter";
import { workspaceCommands } from "./workspace";

export interface Command {
  /** Short left label (chapter number, "obra"). */
  kind?: string;
  label: string;
  hint: string;
  danger?: boolean;
  /** Keeps the palette open when run. */
  keep?: boolean;
  act: () => void;
}

function commonCommands(): Command[] {
  return [
    { label: state.prefs.theme === "dark" ? "Tema claro" : "Tema escuro", hint: "Ctrl J", act: toggleTheme },
    { label: "Atalhos", hint: "Ctrl /", act: () => openPanel("help") },
    { label: "Nuvem", hint: "Ctrl Shift S", act: () => openPanel("cloud") },
    ...(state.update ? [{ label: "Instalar versão " + state.update.version + " (reinicia)", hint: "", act: () => void installUpdate() }] : []),
  ];
}

function libraryCommands(): Command[] {
  const list = libList();
  const cur = list[libSelIndex(list)];
  const out: Command[] = [
    { label: "Nova obra", hint: "N", act: startNew },
    { label: "Importar do Scrivener…", hint: "", act: () => void startScrivenerImport({ type: "new" }) },
  ];
  if (cur) {
    out.push({ label: 'Renomear "' + cur.title + '"', hint: "R", act: () => startRename(cur.id) });
    out.push({ label: (cur.cover ? 'Trocar capa de "' : 'Escolher capa para "') + cur.title + '"', hint: "C", act: () => pickCover(cur.id) });
    if (cur.cover) out.push({ label: "Remover capa (volta a letra)", hint: "Shift C", act: () => clearCover(cur.id) });
    out.push({
      label: 'Excluir "' + cur.title + '"', hint: "Del", danger: true,
      act: () => { focusTarget("lib"); setState("libConfirm", cur.id); },
    });
  }
  return [...out, ...commonCommands(), { label: "Restaurar obras de exemplo", hint: "", act: restoreSamples }];
}

/** Palette items: Rust search hits, matching books, then commands. */
export function paletteItems(): Command[] {
  const q = norm(state.q.trim());
  let out: Command[] = [];
  const book = state.book;
  if (q && state.view === "book" && book) {
    const order = chapterOrder(state.area);
    for (const hit of state.hits) {
      const c = order[hit.index];
      if (!c || c.id !== hit.chapterId) continue;
      const id = c.id;
      out.push({
        kind: pad(hit.index + 1), label: c.title || "Sem título", hint: fmt(c.words ?? 0) + " pal.",
        act: () => { reveal(id); void openNode(id); },
      });
    }
  }
  if (q) {
    for (const b of state.library) {
      if (b.id !== state.curId && norm(b.title).includes(q)) {
        const id = b.id;
        out.push({ kind: "obra", label: b.title, hint: "", act: () => openBook(id) });
      }
    }
  }
  const cmds =
    state.view === "library" || !book
      ? libraryCommands()
      : [...chapterCommands(), ...workspaceCommands(), ...commonCommands()];
  for (const c of cmds) if (!q || norm(c.label).includes(q)) out.push(c);
  if (q) out = out.slice(0, 9);
  return out;
}

export function runCommand(cmd: Command) {
  if (cmd.keep) return cmd.act();
  focusTarget(homeTarget());
  setState({ panel: null, q: "", pIdx: 0, confirmDel: false, hits: [] });
  cmd.act();
}
```

("Voltar às obras" now lives in `workspaceCommands`.)

In `src/components/panels/CommandPalette.tsx`, replace `state.view !== "editor"` with `state.view !== "book"`.

- [ ] **Step 15: Components**

Replace `src/App.tsx`'s imports of `Editor` and `ChapterIndex` (delete both lines) and add `import { openAreaNode } from "./store/selectors/workspace";` (it is already imported — keep one). Replace everything from `const editor = …` to the end of the component with:

```tsx
  const inBook = () => state.view === "book" && !!state.book;
  /** A chapter or a free text is open: notes and paragraph spacing apply to it. */
  const writing = () => {
    const kind = openAreaNode()?.kind;
    return inBook() && (kind === "chapter" || kind === "text");
  };

  return (
    <div class={`app ${state.prefs.theme} w${state.prefs.width} f${state.prefs.font}` + (state.focus && inBook() ? " focus" : "")}>
      <TopBar />
      <Show when={inBook()} fallback={<Library />}>
        <Workspace />
      </Show>
      <BottomBar />

      <Switch>
        <Match when={state.panel === "notes" && writing()}>
          <NotesPanel />
        </Match>
        <Match when={state.panel === "spacing" && writing()}>
          <SpacingPanel />
        </Match>
        <Match when={state.panel === "palette"}>
          <CommandPalette />
        </Match>
        <Match when={state.panel === "help"}>
          <HelpPanel />
        </Match>
        <Match when={state.panel === "cloud"}>
          <CloudPanel />
        </Match>
      </Switch>
      <Show when={state.scrivener}>
        <ScrivenerImport />
      </Show>
    </div>
  );
}
```

Replace `src/components/workspace/Workspace.tsx`:

```tsx
import { Show } from "solid-js";
import { currentChapter } from "../../store/selectors/book";
import { Editor } from "../editor/Editor";
import { NodeView } from "./NodeView";
import { WorkspaceTree } from "./WorkspaceTree";

/** The book screen: the tree on the left, the open chapter (or text, image, attachment) on the right. */
export function Workspace() {
  return (
    <div class="absolute inset-x-0 top-16 bottom-16 flex">
      <aside class="ws-side chrome">
        <WorkspaceTree />
      </aside>
      <div class="ws-main">
        {/* Non-keyed: moving between chapters keeps the chapter editor mounted. */}
        <Show when={currentChapter()} fallback={<NodeView />}>
          <Editor />
        </Show>
      </div>
    </div>
  );
}
```

In `src/components/editor/Editor.tsx`, change the root `div`'s class to `"flex h-full w-full justify-center"` and its doc comment to `/** The chapter's writing column (moldura, título, texto). Clicking outside the text refocuses it. */`.

Replace `src/components/editor/ChapterLabel.tsx`:

```tsx
import { STATUS_LABEL } from "../../lib/constants";
import { pad } from "../../lib/format";
import { currentChapter, currentNumber } from "../../store/selectors/book";
import { StatusDot } from "../ui/StatusDot";

/** "CAPÍTULO 03 · ● RASCUNHO" label above the title; the number follows the reading order. */
export function ChapterLabel() {
  const status = () => currentChapter()?.status ?? "rascunho";
  return (
    <div class="ui chrome cap flex items-center gap-2.5">
      <span>Capítulo {pad(currentNumber())}</span>
      <span class="opacity-50">·</span>
      <StatusDot status={status()} />
      <span>{STATUS_LABEL[status()]}</span>
    </div>
  );
}
```

Replace `src/components/panels/NotesPanel.tsx`:

```tsx
import { Show } from "solid-js";
import { ago, pad } from "../../lib/format";
import { setChapterNotes } from "../../store/actions/chapters";
import { fetchComments } from "../../store/actions/cloud";
import { setNodeNotes } from "../../store/actions/workspace";
import { focusRef } from "../../store/focus";
import { currentNumber } from "../../store/selectors/book";
import { openAreaNode } from "../../store/selectors/workspace";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { SrLabel } from "../ui/SrLabel";

/** Notes of the open chapter or text (Ctrl ;), in a drawer on the right. */
export function NotesPanel() {
  const node = () => openAreaNode();
  const chapter = () => node()?.kind === "chapter";
  const label = () => (chapter() ? "Capítulo " + pad(currentNumber()) : node()?.title || "Documento");
  return (
    <>
      <Scrim />
      <div class="drawer right">
        <div class="ui cap">Notas · {label()}</div>
        <SrLabel for="ch-notes">Notas</SrLabel>
        <textarea
          id="ch-notes"
          class="notes-ta"
          value={node()?.notes ?? ""}
          // Chapter notes save debounced while typing; a text's notes save when the field changes.
          onInput={(e) => chapter() && setChapterNotes(e.currentTarget.value)}
          onChange={(e) => {
            const n = node();
            if (n && !chapter()) void setNodeNotes(n.id, e.currentTarget.value);
          }}
          ref={focusRef("notes")}
          placeholder="Ideias, pendências, lembretes de continuidade…"
        />
        <div class="drawer-foot">
          <Hint keys="Esc">voltar ao texto</Hint>
          <Show when={state.cloudBook?.enabled}>
            <button class="ui crumb" onClick={() => void fetchComments(false)}>
              Buscar comentários
            </button>
            <Show when={state.cloudBook?.lastCommentsAt}>
              <span class="ui crumb">{ago(state.cloudBook!.lastCommentsAt!)}</span>
            </Show>
          </Show>
        </div>
      </div>
    </>
  );
}
```

In `src/components/workspace/NodeView.tsx`: delete the `ws-notes` block from `TextView` (the notes live in the drawer now, `Ctrl ;`), and remove `setNodeNotes` from the import of `../../store/actions/workspace` (keep `openFile`).

In `src/components/workspace/EmptyArea.tsx`, replace the title and text:

```tsx
      <div class="ws-empty-title">Nada aberto</div>
      <p class="ws-empty-text">Escolha um capítulo ou um documento na árvore, ou crie um novo.</p>
```

In `src/components/chrome/TopBar.tsx`, delete the whole `<nav class="tabs" …>…</nav>` element and the import of `goChapters, goWorkspace`.

In `src/components/chrome/BottomBar.tsx`: replace the imports of `openPanel` and `bookLabel` with

```tsx
import { bookLabel, currentChapter } from "../../store/selectors/book";
```

and replace the two `<Match when={state.view === "editor"}>` / `<Match when={state.view === "workspace"}>` blocks with:

```tsx
          <Match when={!library()}>
            <Show when={currentChapter()}>
              <span>{plural(state.liveWords, "palavra", "palavras")}</span>
              <span class="opacity-50">·</span>
            </Show>
            <span>{bookLabel()}</span>
          </Match>
```

In `src/components/chrome/StatusMessage.tsx`, add `import { currentChapter } from "../../store/selectors/book";` and change `showTriple` to `() => state.tripleHint && !state.toast && !!currentChapter()`.

In `src/components/cloud/BookCloudSection.tsx`, add `import { currentChapter, currentNumber } from "../../store/selectors/book";` and replace `shareChapter`:

```tsx
  const shareChapter = () => {
    const c = currentChapter();
    if (c) setState("shareDraft", { kind: "chapter", target: c.id, label: "Capítulo " + pad(currentNumber()) });
  };
```

and give its button `disabled={!currentChapter()}` and the label `Compartilhar capítulo aberto`.

In `src/components/workspace/TreeRow.tsx`: import `openNode` from `../../store/actions/open` (instead of `../../store/actions/workspace`, which keeps `cancelNodeRename, commitNodeRename, startNodeRename`), add `import { isContainer } from "../../lib/manuscript";`, and change `const folder = () => node().kind === "folder";` to `const folder = () => isContainer(node().kind);`.

In `src/components/workspace/treeMenu.ts`: import `openNode, selectNode` from `../../store/actions/open`, keep `addFiles, createNode, openFile, requestDelete, startNodeRename` from `../../store/actions/workspace`, and change the text line to `if (node.kind === "text") return [open, rename, share, del];` (Task 10 replaces this file).

In `src/components/workspace/dragMove.ts`: import `toggleExpanded` from `../../store/actions/expanded` and keep `moveNode` from `../../store/actions/workspace`.

Delete the chapter drawer and the tab styles:

```bash
git rm src/components/panels/ChapterIndex.tsx
```

and in `src/styles/global.css` delete the `.tabs`, `.tab` and `.tab[aria-pressed="true"]` rules.

- [ ] **Step 16: Store tests**

Replace `src/store/actions/chapters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { AreaNode, BookSummary, DocJSON } from "../../api/types";
import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { state } from "../state";
import { newChapterAfterCurrent, setStatus, splitCurrent } from "./chapters";
import { openBook } from "./library";
import { goChapterStep } from "./open";

const doc = (t: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

/** Opens a fresh book (one chapter), isolated from the samples and the other tests. */
async function openNew() {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  await openBook(created.id);
}

describe("chapters in the tree", () => {
  it("a book opens on its chapter, with the Manuscrito expanded", async () => {
    await openNew();
    expect(state.view).toBe("book");
    expect(state.areaOpen).toBe(chapterOrder(state.area)[0].id);
    expect(state.areaExpanded).toContain(state.area[0].id);
  });

  it("Enter ×3 opens the new chapter right after the current one", async () => {
    await openNew();
    const first = state.areaOpen!;
    await splitCurrent(doc("antes"), doc("depois"));
    const order = chapterOrder(state.area).map((c) => c.id);
    expect(order).toHaveLength(2);
    expect(order[0]).toBe(first);
    expect(state.areaOpen).toBe(order[1]);
    expect(state.book!.open).toBe(order[1]);
  });

  it("a new chapter after the current one opens right below", async () => {
    await openNew();
    await newChapterAfterCurrent();
    expect(chapterOrder(state.area)).toHaveLength(2);
    expect(state.areaOpen).toBe(chapterOrder(state.area)[1].id);
  });

  it("Alt ↑ walks the reading order and says when it ends", async () => {
    await openNew();
    const first = state.areaOpen!;
    await newChapterAfterCurrent();
    await goChapterStep(-1);
    expect(state.areaOpen).toBe(first);
    await goChapterStep(-1);
    expect(state.toast).toBe("Este é o primeiro capítulo");
    expect(state.areaOpen).toBe(first);
  });

  it("status changes in the tree and in the backend", async () => {
    await openNew();
    const id = state.areaOpen!;
    setStatus(id, "pronto");
    expect(findNode(state.area, id)!.status).toBe("pronto");
    const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: state.book!.id });
    expect(findNode(tree, id)!.status).toBe("pronto");
  });
});
```

Replace `src/store/actions/workspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import { db } from "../../api/mock/db";
import type { AreaNode, BookMeta, BookSummary } from "../../api/types";
import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { setState, state } from "../state";
import { commitNodeRename, createNode, deleteNode, moveNode, setNodeNotes } from "./workspace";

/** A fresh book with its tree in the store, isolated from the samples and other tests. */
async function newBook(): Promise<BookMeta> {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
  const area = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id });
  setState({
    book, area, areaSel: null, areaOpen: null, areaExpanded: [],
    areaRenaming: null, areaRenameVal: "", areaConfirm: null, toast: "",
  });
  return book;
}

/** Everything after the Manuscrito. */
const outside = () => state.area.slice(1);
const manuscriptId = () => state.area[0].id;

describe("tree actions (mock)", () => {
  it("creates a folder, then a text node inside it, entering rename both times", async () => {
    await newBook();
    await createNode("folder");
    expect(outside()).toHaveLength(1);
    const folder = outside()[0];
    expect(folder.kind).toBe("folder");
    expect(state.areaRenaming).toBe(folder.id);
    setState("areaSel", folder.id);
    await createNode("text");
    const inFolder = findNode(state.area, folder.id)?.children ?? [];
    expect(inFolder.map((n) => [n.kind, n.title])).toEqual([["text", "Novo documento"]]);
    expect(state.areaRenaming).toBe(inFolder[0].id);
  });

  it("renames a node", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    setState("areaRenameVal", "Pesquisa");
    await commitNodeRename();
    expect(findNode(state.area, id)?.title).toBe("Pesquisa");
  });

  it("moves a node inside another folder", async () => {
    await newBook();
    await createNode("folder");
    const first = outside()[0].id;
    setState("areaSel", null);
    await createNode("folder");
    const second = outside().find((n) => n.id !== first)!.id;
    await moveNode(second, first, "inside");
    expect(outside().map((n) => n.id)).toEqual([first]);
    expect(findNode(state.area, first)?.children?.map((n) => n.id)).toEqual([second]);
  });

  it("deletes only on the second call; the open node gives way to the first chapter", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    setState("areaOpen", id);
    deleteNode(id);
    expect(state.areaConfirm).toBe(id);
    expect(outside()).toHaveLength(1);
    await deleteNode(id);
    expect(outside()).toHaveLength(0);
    expect(state.areaOpen).toBe(chapterOrder(state.area)[0].id);
  });

  it("saves node notes immediately (no debounce), skipping the call when unchanged", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    await setNodeNotes(id, "notas");
    const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: state.book!.id });
    expect(findNode(tree, id)?.notes).toBe("notas");
    await setNodeNotes(id, "notas");
    expect(findNode(state.area, id)?.notes).toBe("notas");
  });

  it("a text dropped into the Manuscrito becomes a chapter with the same id", async () => {
    await newBook();
    await createNode("text");
    const id = outside()[0].id;
    await moveNode(id, manuscriptId(), "inside");
    expect(findNode(state.area, id)?.kind).toBe("chapter");
    expect(chapterOrder(state.area).map((c) => c.id)).toContain(id);
  });

  it("an image dropped into the Manuscrito is refused with the reason", async () => {
    const book = await newBook();
    db.books.find((b) => b.id === book.id)!.area.push({ id: "img", kind: "image", title: "Mapa", notes: "", file: "arquivos/img.png" });
    setState("area", await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id }));
    await moveNode("img", manuscriptId(), "inside");
    expect(state.toast).toBe("Imagens e anexos não entram no Manuscrito");
    expect(findNode(state.area, "img")?.kind).toBe("image");
  });

  it("the last chapter cannot leave the Manuscrito", async () => {
    await newBook();
    await createNode("folder");
    const folder = outside()[0].id;
    const only = chapterOrder(state.area)[0].id;
    await moveNode(only, folder, "inside");
    expect(state.toast).toBe("A obra precisa de pelo menos um capítulo");
    expect(chapterOrder(state.area).map((c) => c.id)).toEqual([only]);
  });
});
```

In `src/store/actions/ui.test.ts`, replace the fixture and tests:

```ts
const node = (id: string, kind: AreaNode["kind"], children?: AreaNode[]): AreaNode => ({ id, kind, title: id, notes: "", children });
const area = [
  node("m", "manuscript", [node("cap", "chapter")]),
  node("pasta", "folder", [node("texto", "text"), node("foto", "image")]),
];

describe("homeTarget", () => {
  it("rests on the library grid", () => {
    setState({ view: "library" });
    expect(homeTarget()).toBe("lib");
  });

  it("in a book, rests on the text of an open chapter or text, else on the tree", () => {
    setState({ view: "book", area, areaOpen: "cap" });
    expect(homeTarget()).toBe("body");
    setState("areaOpen", "texto");
    expect(homeTarget()).toBe("body");
    setState("areaOpen", "foto");
    expect(homeTarget()).toBe("tree");
    setState("areaOpen", null);
    expect(homeTarget()).toBe("tree");
    // a stale id (node deleted meanwhile) counts as nothing open
    setState("areaOpen", "sumiu");
    expect(homeTarget()).toBe("tree");
  });
});
```

In `src/store/actions/cloud.test.ts`: add `import { chapterOrder } from "../../lib/manuscript";` and `import { findNode } from "../../lib/tree";`; in "creating a link copies its URL" use `target: chapterOrder(state.area)[0].id`; in "fetched comments land in the chapter notes of the open book" replace the two `state.book!.chapters[state.book!.cur]` expressions: `const chapterId = state.areaOpen!;` and `expect(findNode(state.area, chapterId)!.notes).toContain("achei confuso");`.

- [ ] **Step 17: Run everything**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS, no type errors. Then `bun run dev`, open a sample book in the browser: the tree shows "Manuscrito" with the chapters; clicking a chapter shows the editor with the frame; clicking a text shows the free editor; there are no tabs.

- [ ] **Step 18: Commit**

```bash
git add src/api src/lib/types.ts src/store src/App.tsx src/components src/styles/global.css
git status --short   # must list no .DS_Store
git commit -m "feat(front): one book screen with the tree; chapters are tree nodes"
```

---
### Task 9: Collapsible sidebar, remembered per book

**Files:**
- Modify: `src-tauri/src/model/prefs.rs`
- Modify: `src/api/types.ts` (`Prefs`), `src/lib/constants.ts` (`DEFAULT_PREFS`), `src/api/mock/db.ts` (`db.prefs`)
- Create: `src/store/actions/sidebar.ts`, `src/store/actions/sidebar.test.ts`
- Create: `src/components/workspace/SidebarFoot.tsx`
- Modify: `src/components/workspace/Workspace.tsx`, `src/store/keys/global.ts`, `src/store/commands/workspace.ts`, `src/styles/global.css`

**Interfaces:**
- Consumes: `updatePrefs(patch)` (`store/actions/prefs.ts`), `homeTarget()`.
- Produces:
  - Rust `Prefs.sidebar_closed: Vec<String>` (JSON `sidebarClosed`, default `[]`); `PrefsPatch.sidebar_closed: Option<Vec<String>>` replaces the list.
  - `Prefs.sidebarClosed: string[]` in TS.
  - `store/actions/sidebar.ts`: `sidebarOpen(): boolean`, `toggleSidebar(): void`.
  - `SidebarFoot` component: the footer of the sidebar (Task 10 adds "+ Novo" to it).

- [ ] **Step 1: Rust prefs (failing test first)**

Add to the tests of `src-tauri/src/model/prefs.rs`:

```rust
    #[test]
    fn closed_sidebars_are_replaced_and_default_to_none() {
        let p: Prefs = serde_json::from_str(r#"{"theme":"dark","goal":2000,"width":1,"font":1}"#).unwrap();
        assert!(p.sidebar_closed.is_empty());
        let p = p.apply(PrefsPatch { sidebar_closed: Some(vec!["b1".into()]), ..Default::default() });
        assert_eq!(p.sidebar_closed, vec!["b1".to_string()]);
        assert_eq!(serde_json::to_value(&p).unwrap()["sidebarClosed"][0], "b1");
    }
```

Run: `cargo test --manifest-path src-tauri/Cargo.toml model::prefs`
Expected: compile error (`sidebar_closed` unknown).

Then add the field to `Prefs` (with its default) and to `PrefsPatch`:

```rust
    /// Books whose tree sidebar is collapsed (open is the default).
    #[serde(default)]
    pub sidebar_closed: Vec<String>,
```

```rust
    pub sidebar_closed: Option<Vec<String>>,
```

In `impl Default for Prefs`: `Self { theme: "light".into(), goal: 2000, width: 1, font: 1, sidebar_closed: Vec::new() }`. In `apply`, add `if let Some(v) = p.sidebar_closed { self.sidebar_closed = v; }`.

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

- [ ] **Step 2: Front prefs type**

In `src/api/types.ts`, add to `Prefs`:

```ts
  /** Books whose tree sidebar is collapsed. */
  sidebarClosed: string[];
```

In `src/lib/constants.ts`: `export const DEFAULT_PREFS: Prefs = { theme: "light", goal: 2000, width: 1, font: 1, sidebarClosed: [] };`
In `src/api/mock/db.ts`: `prefs: { theme: "light", goal: 2000, width: 1, font: 1, sidebarClosed: [] } as Prefs`.

- [ ] **Step 3: Write the failing test — `src/store/actions/sidebar.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { getPrefs } from "../../api/prefs";
import type { BookMeta } from "../../api/types";
import { DEFAULT_PREFS } from "../../lib/constants";
import { setState } from "../state";
import { sidebarOpen, toggleSidebar } from "./sidebar";

const book = (id: string): BookMeta => ({
  id, title: "", author: "", open: null, updatedAt: 0, dir: "", cover: null, header: null, footer: null,
  separator: { type: "text", text: "* * *" },
});

describe("sidebar", () => {
  it("is open by default and remembers a collapse per book, in the prefs", async () => {
    setState({ view: "book", book: book("b1"), prefs: { ...DEFAULT_PREFS, sidebarClosed: [] } });
    expect(sidebarOpen()).toBe(true);
    toggleSidebar();
    expect(sidebarOpen()).toBe(false);
    expect((await getPrefs()).sidebarClosed).toContain("b1");
    // Another book keeps its own state.
    setState("book", book("b2"));
    expect(sidebarOpen()).toBe(true);
    setState("book", book("b1"));
    toggleSidebar();
    expect(sidebarOpen()).toBe(true);
    expect((await getPrefs()).sidebarClosed).not.toContain("b1");
  });
});
```

Run: `bun run test src/store/actions/sidebar.test.ts`
Expected: FAIL — `./sidebar` does not exist.

- [ ] **Step 4: Write `src/store/actions/sidebar.ts`**

```ts
import { focusTarget } from "../focus";
import { state } from "../state";
import { updatePrefs } from "./prefs";
import { homeTarget } from "./ui";

/** The open book's tree sidebar is showing: open unless collapsed for this book. */
export const sidebarOpen = () => !!state.book && !state.prefs.sidebarClosed.includes(state.book.id);

/** « button and Ctrl E: collapses or reopens the tree for this book; saved in the Rust prefs. */
export function toggleSidebar() {
  const id = state.book?.id;
  if (!id) return;
  const wasOpen = sidebarOpen();
  const others = state.prefs.sidebarClosed.filter((x) => x !== id);
  updatePrefs({ sidebarClosed: wasOpen ? [...others, id] : others });
  // A collapsed tree cannot keep the keyboard: focus goes back to the open text (or the tree when it returns).
  focusTarget(homeTarget());
}
```

Run: `bun run test src/store/actions/sidebar.test.ts`
Expected: PASS.

- [ ] **Step 5: The sidebar and its rail**

Create `src/components/workspace/SidebarFoot.tsx`:

```tsx
import { toggleSidebar } from "../../store/actions/sidebar";

/** Bottom of the tree sidebar: the collapse button (and "+ Novo", Task 10). */
export function SidebarFoot() {
  return (
    <div class="ws-foot">
      <span />
      <button type="button" class="ui crumb" title="Recolher a árvore (Ctrl E)" aria-label="Recolher a árvore" onClick={toggleSidebar}>
        «
      </button>
    </div>
  );
}
```

Replace `src/components/workspace/Workspace.tsx`:

```tsx
import { Show } from "solid-js";
import { sidebarOpen, toggleSidebar } from "../../store/actions/sidebar";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Editor } from "../editor/Editor";
import { NodeView } from "./NodeView";
import { SidebarFoot } from "./SidebarFoot";
import { WorkspaceTree } from "./WorkspaceTree";

/** Collapsed sidebar: a thin rail whose » reopens the tree. */
function Rail() {
  return (
    <aside class="ws-rail chrome">
      <button type="button" class="ui crumb" title="Mostrar a árvore (Ctrl E)" aria-label="Mostrar a árvore" onClick={toggleSidebar}>
        »
      </button>
    </aside>
  );
}

/** The book screen: the tree on the left, the open chapter (or text, image, attachment) on the right. */
export function Workspace() {
  return (
    <div class="absolute inset-x-0 top-16 bottom-16 flex">
      {/* Focus mode hides the sidebar entirely; the top and bottom bars fade out. */}
      <Show when={!state.focus}>
        <Show when={sidebarOpen()} fallback={<Rail />}>
          <aside class="ws-side chrome">
            <WorkspaceTree />
            <SidebarFoot />
          </aside>
        </Show>
      </Show>
      <div class="ws-main">
        {/* Non-keyed: moving between chapters keeps the chapter editor mounted. */}
        <Show when={currentChapter()} fallback={<NodeView />}>
          <Editor />
        </Show>
      </div>
    </div>
  );
}
```

In `src/styles/global.css`, replace the `.ws-side` and `.ws-tree` rules and add the new ones:

```css
  .ws-side {
    width: 280px;
    flex-shrink: 0;
    border-right: 1px solid var(--faint);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .ws-tree {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    box-sizing: border-box;
    padding: 12px 8px;
    outline: none;
  }
  .ws-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--faint);
  }
  .ws-rail {
    width: 36px;
    flex-shrink: 0;
    border-right: 1px solid var(--faint);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    padding: 8px 0;
  }
```

- [ ] **Step 6: Ctrl E and the palette**

In `src/store/keys/global.ts`, add `import { toggleSidebar } from "../actions/sidebar";` and, right after the `Ctrl O` line, the branch:

```ts
  else if (inBook && mod && !e.shiftKey && (k === "e" || code === "KeyE")) toggleSidebar();
```

In `src/store/commands/workspace.ts`, add `import { sidebarOpen, toggleSidebar } from "../actions/sidebar";` and make the first item of `list`:

```ts
    { label: sidebarOpen() ? "Recolher barra lateral" : "Mostrar barra lateral", hint: "Ctrl E", act: toggleSidebar },
```

- [ ] **Step 7: Run tests and typecheck**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p . && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS. In `bun run dev`: « collapses to the rail, » and `Ctrl E` reopen it, reloading the page keeps the choice for that book, another book is still open, `Ctrl .` hides the tree.

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/model/prefs.rs src/api/types.ts src/lib/constants.ts src/api/mock/db.ts src/store/actions/sidebar.ts src/store/actions/sidebar.test.ts src/components/workspace/SidebarFoot.tsx src/components/workspace/Workspace.tsx src/store/keys/global.ts src/store/commands/workspace.ts src/styles/global.css
git commit -m "feat(front): collapsible tree sidebar remembered per book"
```

---
### Task 10: Tree rows, "+ Novo" and context menus per type

**Files:**
- Rewrite: `src/components/workspace/treeMenu.ts`; Create: `src/components/workspace/treeMenu.test.ts`
- Modify: `src/store/actions/workspace.ts` (`moveIntoManuscript`, `moveOutOfManuscript`, `requestDelete`), `src/store/actions/workspace.test.ts`
- Modify: `src/components/workspace/SidebarFoot.tsx`, `src/components/workspace/TreeRow.tsx`, `src/components/workspace/NodeIcon.tsx`, `src/components/workspace/WorkspaceTree.tsx`, `src/components/workspace/EmptyArea.tsx`, `src/store/keys/workspace.ts`, `src/styles/global.css`

**Interfaces:**
- Consumes: Task 8 actions (`createNode`, `moveTo`, `requestDelete`, `setStatus`, `copyChapter`, `openNode`, `selectNode`), Task 7 helpers.
- Produces:
  - `treeMenu(node: AreaNode | null): MenuItem[]` (spec table), `newMenu(): MenuItem[]` ("+ Novo" for the current selection), `selectForMenu(node)`.
  - `moveIntoManuscript(id): Promise<void>` (text → last chapter), `moveOutOfManuscript(id): Promise<void>` (chapter → text at the end of the root).
  - `requestDelete` names how many chapters a folder takes with it.

- [ ] **Step 1: Write the failing tests**

Create `src/components/workspace/treeMenu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AreaNode } from "../../api/types";
import { findNode } from "../../lib/tree";
import { setState } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";
import { newMenu, treeMenu } from "./treeMenu";

const n = (id: string, kind: AreaNode["kind"], children?: AreaNode[], extra: Partial<AreaNode> = {}): AreaNode =>
  ({ id, kind, title: id, notes: "", children, ...extra });
const area: AreaNode[] = [
  n("m", "manuscript", [n("p", "folder", [n("c1", "chapter", undefined, { status: "revisao" })]), n("c2", "chapter")]),
  n("f", "folder", [n("t", "text"), n("i", "image"), n("a", "file")]),
];
const labels = (items: MenuItem[]) => items.map((i) => i.label);
const menuOf = (id: string) => treeMenu(findNode(area, id));

describe("tree menus", () => {
  it("offer per node type what the spec lists", () => {
    setState({ area, areaSel: null });
    expect(labels(menuOf("m"))).toEqual(["Novo capítulo", "Nova pasta"]);
    expect(labels(menuOf("p"))).toEqual(["Novo capítulo", "Nova pasta", "Renomear", "Excluir"]);
    expect(labels(menuOf("c2"))).toEqual([
      "Renomear", "Status: Rascunho", "Status: Revisão", "Status: Pronto", "Compartilhar…",
      "Copiar para publicar", "Mover para fora do Manuscrito", "Excluir",
    ]);
    expect(labels(menuOf("f"))).toEqual(["Novo texto", "Nova pasta", "Adicionar imagem ou arquivo…", "Renomear", "Compartilhar…", "Excluir"]);
    expect(labels(menuOf("t"))).toEqual(["Abrir", "Renomear", "Compartilhar…", "Mover para o Manuscrito", "Excluir"]);
    expect(labels(menuOf("i"))).toEqual(["Abrir", "Renomear", "Excluir"]);
    expect(labels(menuOf("a"))).toEqual(["Abrir", "Abrir no app padrão", "Renomear", "Excluir"]);
    expect(labels(treeMenu(null))).toEqual(["Novo texto", "Nova pasta", "Adicionar imagem ou arquivo…"]);
  });

  it("marks the chapter's current status", () => {
    setState({ area });
    const status = menuOf("c1").filter((i) => i.label.startsWith("Status"));
    expect(status.map((i) => !!i.disabled)).toEqual([false, true, false]);
  });

  it("+ Novo offers Capítulo only inside the Manuscrito and Texto only outside", () => {
    setState({ area, areaSel: "c1" });
    expect(labels(newMenu())).toEqual(["Capítulo", "Pasta"]);
    setState("areaSel", "m");
    expect(labels(newMenu())).toEqual(["Capítulo", "Pasta"]);
    setState("areaSel", "t");
    expect(labels(newMenu())).toEqual(["Texto", "Pasta", "Imagem ou arquivo…"]);
    setState("areaSel", null);
    expect(labels(newMenu())).toEqual(["Texto", "Pasta", "Imagem ou arquivo…"]);
  });
});
```

Add to `src/store/actions/workspace.test.ts` (and import `moveIntoManuscript, moveOutOfManuscript, requestDelete` from `./workspace`):

```ts
  it("Mover para o Manuscrito / para fora convert the node and say so", async () => {
    await newBook();
    await createNode("text");
    const t = outside()[0].id;
    await moveIntoManuscript(t);
    expect(findNode(state.area, t)?.kind).toBe("chapter");
    const order = chapterOrder(state.area);
    expect(order[order.length - 1].id).toBe(t);
    expect(state.toast).toBe("Agora é o capítulo 02");
    await moveOutOfManuscript(t);
    expect(findNode(state.area, t)?.kind).toBe("text");
    expect(state.area[state.area.length - 1].id).toBe(t);
    expect(state.toast).toBe("«Novo documento» saiu do Manuscrito");
  });

  it("deleting a Manuscrito folder says how many chapters go with it", async () => {
    await newBook();
    setState("areaSel", manuscriptId());
    await createNode("folder");
    const part = state.areaSel!;
    await createNode("chapter");
    await createNode("chapter");
    expect(findNode(state.area, part)?.children).toHaveLength(2);
    await requestDelete(part);
    expect(state.toast).toBe("Aperte Delete de novo para excluir «Nova pasta» e 2 capítulos");
    expect(findNode(state.area, part)).not.toBeNull();
  });
```

Run: `bun run test src/components/workspace src/store/actions/workspace.test.ts`
Expected: FAIL — `newMenu`, `moveIntoManuscript`, `moveOutOfManuscript` not exported; labels differ.

- [ ] **Step 2: Moves and the delete confirmation in `src/store/actions/workspace.ts`**

Change the lib imports to:

```ts
import { chapterCount, chapterNumber, displayTitle, isContainer, manuscriptOf } from "../../lib/manuscript";
import { pad, plural } from "../../lib/format";
```

(and drop the old `import { pad } from "../../lib/format";`). Replace `requestDelete` and add the two moves after `moveNode`:

```ts
/** Delete with confirmation: the first request arms it and says how to confirm (and how many chapters go along), the second deletes. */
export function requestDelete(id: string) {
  const node = findNode(state.area, id);
  if (!node) return;
  if (state.areaConfirm === id) return deleteNode(id);
  void deleteNode(id);
  const chapters = node.kind === "folder" ? chapterCount(node) : 0;
  flash(
    "Aperte Delete de novo para excluir «" + displayTitle(state.area, node) + "»" +
      (chapters ? " e " + plural(chapters, "capítulo", "capítulos") : ""),
  );
}
```

```ts
/** "Mover para o Manuscrito": the text becomes the last chapter. */
export async function moveIntoManuscript(id: string) {
  const m = manuscriptOf(state.area);
  if (!m) return;
  await moveTo(id, m.id, m.children?.length ?? 0);
  if (findNode(state.area, id)?.kind === "chapter") flash("Agora é o capítulo " + pad(chapterNumber(state.area, id)));
}

/** "Mover para fora do Manuscrito": the chapter becomes a text at the end of the tree. */
export async function moveOutOfManuscript(id: string) {
  const title = findNode(state.area, id)?.title.trim() || "Sem título";
  await moveTo(id, null, state.area.length);
  if (findNode(state.area, id)?.kind === "text") flash("«" + title + "» saiu do Manuscrito");
}
```

- [ ] **Step 3: Menus — replace `src/components/workspace/treeMenu.ts`**

```ts
import type { AreaNode } from "../../api/types";
import { STATUS, STATUS_LABEL } from "../../lib/constants";
import { pad } from "../../lib/format";
import { chapterNumber, inManuscript } from "../../lib/manuscript";
import { copyChapter, setStatus } from "../../store/actions/chapters";
import { openNode, selectNode } from "../../store/actions/open";
import { openPanel } from "../../store/actions/ui";
import {
  addFiles, createNode, moveIntoManuscript, moveOutOfManuscript, openFile, requestDelete, startNodeRename,
} from "../../store/actions/workspace";
import { setState, state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

// Context menus of the tree, one list per node type (spec table "Menu de contexto"). New
// items land in the selected folder: right click selects first, see `selectForMenu`.

const newChapter: MenuItem = { label: "Novo capítulo", act: () => void createNode("chapter") };
const newFolder: MenuItem = { label: "Nova pasta", act: () => void createNode("folder") };
const outsideCreators = (): MenuItem[] => [
  { label: "Novo texto", act: () => void createNode("text") },
  newFolder,
  { label: "Adicionar imagem ou arquivo…", act: () => void addFiles() },
];

/** "+ Novo" at the foot of the sidebar: what can be created where the selection is. */
export function newMenu(): MenuItem[] {
  const sel = state.areaSel;
  if (sel && inManuscript(state.area, sel)) {
    return [
      { label: "Capítulo", act: () => void createNode("chapter") },
      { label: "Pasta", act: () => void createNode("folder") },
    ];
  }
  return [
    { label: "Texto", act: () => void createNode("text") },
    { label: "Pasta", act: () => void createNode("folder") },
    { label: "Imagem ou arquivo…", act: () => void addFiles() },
  ];
}

function share(kind: "chapter" | "workspace", node: AreaNode): MenuItem {
  return {
    label: "Compartilhar…",
    act: () => {
      const label = kind === "chapter" ? "Capítulo " + pad(chapterNumber(state.area, node.id)) : node.title || "Item da área";
      setState("shareDraft", { kind, target: node.id, label });
      openPanel("cloud");
    },
  };
}

/** Context menu items for a node, or for the empty tree background when `node` is null. */
export function treeMenu(node: AreaNode | null): MenuItem[] {
  if (!node) return outsideCreators();
  const id = node.id;
  const rename: MenuItem = { label: "Renomear", act: () => startNodeRename(id) };
  const del: MenuItem = { label: "Excluir", danger: true, act: () => void requestDelete(id) };
  const open: MenuItem = { label: "Abrir", act: () => void openNode(id) };
  const inside = inManuscript(state.area, id);
  switch (node.kind) {
    case "manuscript":
      return [newChapter, newFolder];
    case "folder":
      return inside ? [newChapter, newFolder, rename, del] : [...outsideCreators(), rename, share("workspace", node), del];
    case "chapter":
      return [
        rename,
        ...STATUS.map((s): MenuItem => ({ label: "Status: " + STATUS_LABEL[s], disabled: (node.status ?? "rascunho") === s, act: () => setStatus(id, s) })),
        share("chapter", node),
        { label: "Copiar para publicar", act: () => void copyChapter(id) },
        { label: "Mover para fora do Manuscrito", act: () => void moveOutOfManuscript(id) },
        del,
      ];
    case "text":
      return [open, rename, share("workspace", node), { label: "Mover para o Manuscrito", act: () => void moveIntoManuscript(id) }, del];
    case "file":
      return [open, { label: "Abrir no app padrão", act: () => void openFile(id) }, rename, del];
    default:
      return [open, rename, del];
  }
}

/** Right click targets: selecting first makes "new item" land inside that folder. */
export function selectForMenu(node: AreaNode | null) {
  selectNode(node ? node.id : null);
}
```

- [ ] **Step 4: "+ Novo" in the sidebar foot — replace `src/components/workspace/SidebarFoot.tsx`**

```tsx
import { createSignal, Show } from "solid-js";
import { toggleSidebar } from "../../store/actions/sidebar";
import { focusTarget } from "../../store/focus";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { newMenu } from "./treeMenu";

/** Bottom of the tree sidebar: "+ Novo" (options follow the selection) and the collapse button. */
export function SidebarFoot() {
  const [menu, setMenu] = createSignal<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const open = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.top, items: newMenu() });
  };
  return (
    <div class="ws-foot">
      <button type="button" class="ui crumb" aria-haspopup="menu" title="Criar na pasta selecionada" onClick={open}>
        + Novo
      </button>
      <button type="button" class="ui crumb" title="Recolher a árvore (Ctrl E)" aria-label="Recolher a árvore" onClick={toggleSidebar}>
        «
      </button>
      <Show when={menu()}>
        {(m) => (
          <ContextMenu
            x={m().x}
            y={m().y}
            items={m().items}
            onClose={() => {
              setMenu(null);
              focusTarget("tree");
            }}
          />
        )}
      </Show>
    </div>
  );
}
```

- [ ] **Step 5: Rows and icons**

In `src/components/workspace/TreeRow.tsx`:
1. Add imports:

```tsx
import { fmt } from "../../lib/format";
import { displayTitle } from "../../lib/manuscript";
import { bookWordsLive } from "../../store/selectors/book";
import { StatusDot } from "../ui/StatusDot";
```

2. Replace the title `<Show when={state.areaRenaming === id()} …>` block with:

```tsx
      <Show when={state.areaRenaming === id()} fallback={<span class="ws-t">{displayTitle(state.area, node())}</span>}>
        <RenameField id={id()} />
      </Show>
      <Show when={node().kind === "chapter"}>
        <StatusDot status={node().status ?? "rascunho"} />
        <span class="ws-words">{fmt(id() === state.areaOpen ? state.liveWords : (node().words ?? 0))}</span>
      </Show>
      <Show when={node().kind === "manuscript"}>
        <span class="ws-words" title="Palavras na obra">{fmt(bookWordsLive())}</span>
      </Show>
```

3. Change `onDblClick={() => startNodeRename(id())}` to `onDblClick={() => node().kind !== "manuscript" && startNodeRename(id())}`.

In `src/components/workspace/NodeIcon.tsx`, add two `Match` branches before the folder one:

```tsx
        <Match when={props.kind === "manuscript"}>
          <path d="M1.5 3h4c.8 0 1.5.7 1.5 1.5v7c0-.6-.5-1-1.2-1H1.5z" />
          <path d="M12.5 3h-4c-.8 0-1.5.7-1.5 1.5v7c0-.6.5-1 1.2-1h4.3z" />
        </Match>
        <Match when={props.kind === "chapter"}>
          <path d="M3 1.5h8v11H3z" />
          <path d="M5 4.5h4M5 6.5h4M5 8.5h2.5" />
        </Match>
```

In `src/components/workspace/WorkspaceTree.tsx`, change `aria-label="Área de trabalho"` to `aria-label="Árvore da obra"`.

In `src/components/workspace/EmptyArea.tsx`, add `import { inManuscript } from "../../lib/manuscript";` and put a "Novo capítulo" button first in `ws-actions`:

```tsx
        <button type="button" class="sp-btn" onClick={() => void createNode("chapter", { parent: state.area[0]?.id ?? null, index: state.area[0]?.children?.length ?? 0 })}>
          Novo capítulo
        </button>
```

and change the `N` hint to `<Hint keys="N">{state.areaSel && inManuscript(state.area, state.areaSel) ? "capítulo" : "texto"}</Hint>`.

Append to `src/styles/global.css`, after the `.ws-row` rules:

```css
  .ws-words {
    margin-left: auto;
    padding-left: 8px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .ws-row .dot {
    flex-shrink: 0;
    margin-left: 6px;
  }
```

- [ ] **Step 6: `N` creates a chapter inside the Manuscrito**

In `src/store/keys/workspace.ts`, change the `KeyN` branch (and add `inManuscript` to the `../../lib/manuscript` import):

```ts
      else if (e.code === "KeyN") {
        const inside = !!state.areaSel && inManuscript(state.area, state.areaSel);
        void createNode(e.shiftKey ? "folder" : inside ? "chapter" : "text");
      }
```

- [ ] **Step 7: Run tests and typecheck**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS. In `bun run dev`: right click each kind and compare with the spec table; "+ Novo" with a chapter selected shows Capítulo/Pasta, with a text selected Texto/Pasta/Imagem ou arquivo; chapter rows show a status dot and words, the Manuscrito row the book total.

- [ ] **Step 8: Commit**

```bash
git add src/components/workspace src/store/actions/workspace.ts src/store/actions/workspace.test.ts src/store/keys/workspace.ts src/styles/global.css
git commit -m "feat(front): context menus per node type and the + Novo menu"
```

---
### Task 11: Sun/moon theme button

**Files:**
- Create: `src/lib/theme.ts`, `src/lib/theme.test.ts`, `src/store/actions/prefs.test.ts`
- Create: `src/components/chrome/ThemeToggle.tsx`
- Modify: `src/components/chrome/TopBar.tsx`, `src/styles/global.css`

**Interfaces:**
- Consumes: `toggleTheme()` (`store/actions/prefs.ts`, already persisted through `prefs_set` in Rust), `getPrefs()`.
- Produces: `themeButton(theme: "light" | "dark"): { icon: "moon" | "sun"; label: string }`; `ThemeToggle` component.

- [ ] **Step 1: Write the failing tests**

`src/lib/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { themeButton } from "./theme";

describe("themeButton", () => {
  it("shows a moon in the light theme and a sun in the dark one, naming the theme a click gives", () => {
    expect(themeButton("light")).toEqual({ icon: "moon", label: "Tema escuro" });
    expect(themeButton("dark")).toEqual({ icon: "sun", label: "Tema claro" });
  });
});
```

`src/store/actions/prefs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getPrefs } from "../../api/prefs";
import { DEFAULT_PREFS } from "../../lib/constants";
import { themeButton } from "../../lib/theme";
import { setState, state } from "../state";
import { toggleTheme } from "./prefs";

describe("theme toggle", () => {
  it("switches the theme and the icon, and saves the preference", async () => {
    setState("prefs", { ...DEFAULT_PREFS, theme: "light" });
    toggleTheme();
    expect(state.prefs.theme).toBe("dark");
    expect(themeButton(state.prefs.theme).icon).toBe("sun");
    expect((await getPrefs()).theme).toBe("dark");
    toggleTheme();
    expect(themeButton(state.prefs.theme).icon).toBe("moon");
    expect((await getPrefs()).theme).toBe("light");
  });
});
```

Run: `bun run test src/lib/theme.test.ts src/store/actions/prefs.test.ts`
Expected: FAIL — `./theme` does not exist.

- [ ] **Step 2: Write `src/lib/theme.ts`**

```ts
import type { Prefs } from "../api/types";

/** Face of the theme button: a moon in the light theme (a click goes dark), a sun in the dark one. */
export function themeButton(theme: Prefs["theme"]): { icon: "moon" | "sun"; label: string } {
  return theme === "dark" ? { icon: "sun", label: "Tema claro" } : { icon: "moon", label: "Tema escuro" };
}
```

Run: `bun run test src/lib/theme.test.ts src/store/actions/prefs.test.ts`
Expected: PASS.

- [ ] **Step 3: The button — `src/components/chrome/ThemeToggle.tsx`**

```tsx
import { Show } from "solid-js";
import { themeButton } from "../../lib/theme";
import { toggleTheme } from "../../store/actions/prefs";
import { state } from "../../store/state";

/** Sun/moon in the top bar: one click switches the theme (the same preference as Ctrl J). */
export function ThemeToggle() {
  const face = () => themeButton(state.prefs.theme);
  return (
    <button type="button" class="theme-btn" title={face().label + " (Ctrl J)"} aria-label={face().label} onClick={toggleTheme}>
      <svg viewBox="0 0 16 16" class="theme-ico" classList={{ sun: face().icon === "sun" }} aria-hidden="true">
        <Show when={face().icon === "sun"} fallback={<path d="M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8z" />}>
          <circle cx="8" cy="8" r="2.8" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
        </Show>
      </svg>
    </button>
  );
}
```

In `src/components/chrome/TopBar.tsx`, add `import { ThemeToggle } from "./ThemeToggle";` and put `<ThemeToggle />` as the first child of the right-hand `div` (before `<UpdateBadge />`). The top bar is `chrome`, so the button shows in the library and in the book and fades with the bar in focus mode.

Append to `src/styles/global.css` (inside the components layer, next to the top bar rules):

```css
  .theme-btn {
    display: inline-flex;
    padding: 4px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .theme-btn:hover {
    color: var(--ink);
  }
  .theme-btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .theme-ico {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.4;
    stroke-linecap: round;
    stroke-linejoin: round;
    transition: transform 0.25s ease;
  }
  .theme-ico.sun {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .theme-ico {
      transition: none;
    }
  }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS. In `bun run dev`: the moon shows in the light theme; one click turns the app dark and the icon into a sun; the tooltip reads "Tema claro (Ctrl J)"; `Ctrl J` and the palette still switch it.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts src/store/actions/prefs.test.ts src/components/chrome/ThemeToggle.tsx src/components/chrome/TopBar.tsx src/styles/global.css
git commit -m "feat(front): visible sun/moon theme button"
```

---
### Task 12: Palette, help and free texts without chapter extras

**Files:**
- Modify: `src/store/commands/workspace.ts`
- Create: `src/store/commands/palette.test.ts`
- Modify: `src/data/shortcuts.ts`
- Modify: `src/editor/writerKeys.ts`, `src/editor/createEditor.ts`, `src/components/editor/RichEditor.tsx`
- Create: `src/editor/writerKeys.test.ts`

**Interfaces:**
- Consumes: Tasks 8–10 (`createNode`, `moveIntoManuscript`, `moveOutOfManuscript`, `sidebarOpen`, `toggleSidebar`, `inManuscript`, `manuscriptOf`).
- Produces: palette items "Novo capítulo", "Novo texto", "Nova pasta", "Recolher barra lateral"/"Mostrar barra lateral", "Mover para o Manuscrito", "Mover para fora do Manuscrito"; `WriterKeysOptions.separatorKey: boolean`, `WriterEditorOptions.separatorKey?: boolean` (default true).

- [ ] **Step 1: Write the failing tests**

`src/store/commands/palette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { BookSummary } from "../../api/types";
import { SHORTCUTS } from "../../data/shortcuts";
import { openBook } from "../actions/library";
import { createNode } from "../actions/workspace";
import { setState } from "../state";
import { paletteItems } from "./palette";

const labels = () => paletteItems().map((c) => c.label);

describe("palette in a book", () => {
  it("has no tab or index commands and offers the tree ones", async () => {
    const created = await mockInvoke<BookSummary>("library_create", { title: "Paleta" });
    await openBook(created.id);
    setState({ q: "" });
    for (const gone of ["Capítulos", "Área de trabalho", "Índice de capítulos", "Enviar capítulo para a área de trabalho"]) {
      expect(labels()).not.toContain(gone);
    }
    expect(labels()).toEqual(expect.arrayContaining(["Novo capítulo", "Novo texto", "Nova pasta", "Recolher barra lateral", "Mover para fora do Manuscrito"]));
    setState("areaSel", null);
    await createNode("text");
    expect(labels()).toContain("Mover para o Manuscrito");
  });

  it("help lists the tree shortcuts and no tab shortcut", () => {
    const help = SHORTCUTS.map((s) => s.label);
    expect(help).toContain("Mostrar / recolher a árvore");
    expect(help.some((l) => l.includes("Área de trabalho"))).toBe(false);
    expect(help.some((l) => l.includes("Índice"))).toBe(false);
  });
});
```

`src/editor/writerKeys.test.ts`:

```ts
import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createWriterEditor } from "./createEditor";

function editor(separatorKey: boolean): Editor {
  return createWriterEditor({
    element: document.createElement("div"),
    separator: () => ({ kind: "text", text: "* * *" }),
    resolveImage: () => null,
    onChange: () => {},
    onFormat: () => {},
    onHint: () => {},
    onExitTop: () => {},
    ariaLabel: "texto",
    placeholder: "",
    separatorKey,
  });
}

const ctrlEnter = (ed: Editor) =>
  ed.view.someProp("handleKeyDown", (f) => f(ed.view, new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true })));
const separators = (ed: Editor) => (ed.getJSON().content ?? []).filter((b) => b.type === "separator").length;

describe("Ctrl Enter", () => {
  it("inserts a separator in chapters only", () => {
    const chapter = editor(true);
    ctrlEnter(chapter);
    expect(separators(chapter)).toBe(1);
    const free = editor(false);
    // The key falls through to the default keymap (a line break), never to a separator.
    ctrlEnter(free);
    expect(separators(free)).toBe(0);
    chapter.destroy();
    free.destroy();
  });
});
```

Run: `bun run test src/store/commands src/editor/writerKeys.test.ts`
Expected: FAIL — missing palette labels, old help labels, `separatorKey` unknown.

- [ ] **Step 2: Palette — replace `src/store/commands/workspace.ts`**

```ts
import { inManuscript, manuscriptOf } from "../../lib/manuscript";
import { goLibrary } from "../actions/library";
import { startScrivenerImport } from "../actions/scrivener";
import { sidebarOpen, toggleSidebar } from "../actions/sidebar";
import {
  addFiles, createNode, deleteNode, moveIntoManuscript, moveOutOfManuscript, startNodeRename,
} from "../actions/workspace";
import { focusTarget } from "../focus";
import { openAreaNode, selectedAreaNode } from "../selectors/workspace";
import { state } from "../state";
import { formatCommands } from "./format";
import type { Command } from "./palette";

/** Imports a Scrivener project into the open book. */
function importIntoBook() {
  const id = state.book?.id;
  if (id) void startScrivenerImport({ type: "book", id });
}

/** A chapter lands in the selected Manuscrito folder, or at the end of the Manuscrito. */
function newChapter() {
  const sel = state.areaSel;
  if (sel && inManuscript(state.area, sel)) return createNode("chapter");
  const m = manuscriptOf(state.area);
  return createNode("chapter", { parent: m?.id ?? null, index: m?.children?.length ?? 0 });
}

/** A text lands in the selected folder outside the Manuscrito, or at the end of the tree. */
function newText() {
  const sel = state.areaSel;
  if (sel && inManuscript(state.area, sel)) return createNode("text", { parent: null, index: state.area.length });
  return createNode("text");
}

/** Palette items for the book's tree (the chapter and common ones are added by the palette). */
export function workspaceCommands(): Command[] {
  const sel = selectedAreaNode();
  const list: Command[] = [
    { label: sidebarOpen() ? "Recolher barra lateral" : "Mostrar barra lateral", hint: "Ctrl E", act: toggleSidebar },
    { label: "Novo capítulo", hint: "N", act: () => void newChapter() },
    { label: "Novo texto", hint: "N", act: () => void newText() },
    { label: "Nova pasta", hint: "Shift N", act: () => void createNode("folder") },
    { label: "Adicionar arquivos…", hint: "", act: () => void addFiles() },
    { label: "Importar do Scrivener…", hint: "", act: () => importIntoBook() },
  ];
  if (sel && sel.kind !== "manuscript") {
    const id = sel.id;
    list.push({ label: "Renomear «" + sel.title + "»", hint: "F2", act: () => startNodeRename(id) });
    if (sel.kind === "text") list.push({ label: "Mover para o Manuscrito", hint: "", act: () => void moveIntoManuscript(id) });
    if (sel.kind === "chapter") list.push({ label: "Mover para fora do Manuscrito", hint: "", act: () => void moveOutOfManuscript(id) });
    list.push(
      state.areaConfirm === id
        ? { label: "Confirmar: excluir «" + sel.title + "»?", hint: "Enter", danger: true, act: () => void deleteNode(id) }
        : { label: "Excluir «" + sel.title + "»", hint: "Del", danger: true, keep: true, act: () => void deleteNode(id) },
    );
  }
  list.push({ label: "Renomear obra", hint: "", act: () => focusTarget("book", "end") });
  list.push({ label: "Voltar às obras", hint: "Ctrl O", act: goLibrary });
  if (openAreaNode()?.kind === "text") list.push(...formatCommands());
  return list;
}
```

- [ ] **Step 3: Help — replace `SHORTCUTS` in `src/data/shortcuts.ts`**

```ts
/** List shown in the help panel (Ctrl /). */
export const SHORTCUTS: Shortcut[] = [
  { label: "Novo capítulo (divide no cursor)", keys: ["Enter", "Enter", "Enter"] },
  { label: "Nova linha sem contar", keys: ["Shift", "Enter"] },
  { label: "Inserir separador (capítulo)", keys: ["Ctrl", "Enter"] },
  { label: "Inserir imagem (ou arraste para a página)", keys: ["Ctrl", "Shift", "I"] },
  { label: "Negrito", keys: ["Ctrl", "B"] },
  { label: "Itálico", keys: ["Ctrl", "I"] },
  { label: "Alinhar esquerda / centro / direita / justificado", keys: ["Ctrl", "Shift", "L E R J"] },
  { label: "Comandos e busca", keys: ["Ctrl", "K"] },
  { label: "Voltar às obras", keys: ["Ctrl", "O"] },
  { label: "Mostrar / recolher a árvore", keys: ["Ctrl", "E"] },
  { label: "Notas do capítulo ou texto", keys: ["Ctrl", ";"] },
  { label: "Capítulo anterior / próximo", keys: ["Alt", "↑ ↓"] },
  { label: "Mover capítulo na pasta", keys: ["Alt", "Shift", "↑ ↓"] },
  { label: "Mudar status", keys: ["Alt", "S"] },
  { label: "Árvore: novo capítulo (no Manuscrito) ou texto", keys: ["N"] },
  { label: "Árvore: nova pasta", keys: ["Shift", "N"] },
  { label: "Árvore: renomear", keys: ["F2"] },
  { label: "Árvore: excluir", keys: ["Del", "Del"] },
  { label: "Árvore: menu do item", keys: ["Shift", "F10"] },
  { label: "Modo foco", keys: ["Ctrl", "."] },
  { label: "Tema claro / escuro", keys: ["Ctrl", "J"] },
  { label: "Nuvem: backup e links", keys: ["Ctrl", "Shift", "S"] },
  { label: "Do título para o texto", keys: ["Enter"] },
  { label: "Obras: nova obra", keys: ["N"] },
  { label: "Obras: renomear", keys: ["R"] },
  { label: "Obras: capa (Shift remove)", keys: ["C"] },
  { label: "Obras: excluir", keys: ["Del", "Del"] },
  { label: "Obras: buscar", keys: ["/"] },
  { label: "Esta ajuda", keys: ["Ctrl", "/"] },
  { label: "Fechar e voltar", keys: ["Esc"] },
];
```

- [ ] **Step 4: No separator key in free texts**

In `src/editor/writerKeys.ts`, add the option and honor it:

```ts
export interface WriterKeysOptions {
  /** Null disables the Enter x3 split entirely: a third Enter is then a plain Enter. */
  onSplit: ((before: DocJSON, after: DocJSON) => void) | null;
  /** False leaves Ctrl Enter alone (free texts have no scene separator). */
  separatorKey: boolean;
  onHint: (show: boolean) => void;
  onExitTop: () => void;
}
```

`addOptions()` returns `{ onSplit: null, separatorKey: true, onHint: () => {}, onExitTop: () => {} }`, and the `Ctrl Enter` branch starts with `if (!opts.separatorKey) return false;`:

```ts
            if (event.key === "Enter" && mod && !event.altKey) {
              if (!opts.separatorKey) return false;
              reset();
              // The trailing paragraph keeps a place to type after the separator.
              editor.chain().focus().insertContent([{ type: "separator" }, { type: "paragraph" }]).run();
              return true;
            }
```

In `src/editor/createEditor.ts`, change the options interface and the `WriterKeys.configure` call:

```ts
export interface WriterEditorOptions extends Omit<WriterKeysOptions, "onSplit" | "separatorKey"> {
  element: HTMLElement;
  separator: () => SeparatorView;
  resolveImage: (src: string) => string | null;
  onChange: () => void;
  onFormat: (editor: Editor) => void;
  /** Absent disables Enter x3: the 3rd Enter becomes a plain Enter, with no streak or hint. */
  onSplit?: (before: DocJSON, after: DocJSON) => void;
  /** False: Ctrl Enter inserts no separator (free texts). Defaults to true. */
  separatorKey?: boolean;
  ariaLabel: string;
  placeholder: string;
}
```

```ts
      WriterKeys.configure({ onSplit: o.onSplit ?? null, separatorKey: o.separatorKey ?? true, onHint: o.onHint, onExitTop: o.onExitTop }),
```

In `src/components/editor/RichEditor.tsx`, in the `"area"` branch of `createWriterEditor({...})`, add `separatorKey: false,` after `onExitTop: () => {},`.

- [ ] **Step 5: Run tests and typecheck**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/store/commands/workspace.ts src/store/commands/palette.test.ts src/data/shortcuts.ts src/editor/writerKeys.ts src/editor/createEditor.ts src/editor/writerKeys.test.ts src/components/editor/RichEditor.tsx
git commit -m "feat(front): palette and help for the single tree; no separator in free texts"
```

---
### Task 13: README — "Manuscrito e área de trabalho"

**Files:**
- Modify: `README.md`

**Interfaces:** none (documentation). Spec section "Documentação".

- [ ] **Step 1: Merge the two feature sections**

In `README.md`, replace the whole `### Organização dos capítulos` section **and** the whole `### Área de trabalho` section (keep `### Meta diária` between the others) with one section placed where "Organização dos capítulos" was:

```markdown
### Manuscrito e área de trabalho

Cada obra é uma árvore só, numa barra lateral ao lado do texto (aberta por padrão; `«` ou `Ctrl E`
recolhem e reabrem, e a escolha fica salva por obra).

- **Manuscrito**, fixo no topo, guarda os capítulos. Pastas dentro dele (ex.: "Parte 1") só agrupam: a
  numeração continua de uma parte para a outra.
- O resto da árvore guarda pesquisa, fichas de personagens, mapas e rascunhos: pastas, textos livres,
  imagens e anexos.
- Arrastar um texto para dentro do Manuscrito (ou "Mover para o Manuscrito") o torna capítulo; arrastar um
  capítulo para fora o torna texto, com o conteúdo e as notas. Imagens e anexos não entram no Manuscrito.
- **+ Novo** no pé da barra cria capítulo (no Manuscrito), texto, pasta, imagem ou arquivo na pasta
  selecionada. Botão direito abre o menu de cada item (renomear, status, compartilhar, copiar para publicar,
  mover, excluir).
- Cada capítulo mostra status (rascunho, revisão, pronto — `Alt S`) e palavras; o Manuscrito mostra o total
  da obra.
- Notas por capítulo ou texto (`Ctrl ;`), fora do texto.
- Capítulo anterior / seguinte na ordem do Manuscrito (`Alt ↑ ↓`); mover o capítulo dentro da pasta
  (`Alt Shift ↑ ↓`).
- Textos livres usam o mesmo editor, sem moldura, separador nem `Enter ×3`; imagens aparecem no app; PDFs e
  outros arquivos abrem no programa padrão do sistema.
- Obras antigas são convertidas sozinhas ao abrir: os capítulos entram no Manuscrito na mesma ordem e uma
  cópia do `metadata.json` original fica em `metadata.antes-da-migracao.json`.
```

In `### Editor de capítulos`, change the last bullet to:

```markdown
- Modo foco (`Ctrl .`, esconde a árvore e as barras), tema claro e escuro (botão de sol/lua na barra de cima
  ou `Ctrl J`), largura do texto e tamanho da letra ajustáveis.
```

In `### Importação do Scrivener`, change the third bullet to:

```markdown
- Tela de importação onde você escolhe, item por item, o que vira capítulo; os capítulos entram no
  Manuscrito na ordem do binder e o resto vai para a árvore. Dentro de uma obra aberta, os capítulos entram
  no fim do Manuscrito.
```

In `### Nuvem (opcional)`, change the links bullet to:

```markdown
- Links públicos de um capítulo (botão direito no capítulo, "Compartilhar") ou de parte da árvore, com
  comentários. Os comentários chegam nas notas do capítulo ou do texto.
```

- [ ] **Step 2: Data layout**

Replace the tree block of `## Onde ficam os dados` with:

```
~/Documentos/Scribalis/
  minha-obra/
    metadata.json      título, autor, capa, separador, molduras e o último item aberto
    capitulos/         um arquivo .md por capítulo
    imagens/           capa, molduras, separador e imagens dos capítulos
    area/
      area.json        a árvore da obra: o Manuscrito (ordem, status, notas e palavras dos capítulos) e o resto
      arquivos/        textos, imagens e anexos fora do Manuscrito
```

and the paragraph under it with:

```markdown
Renomear uma obra no app não renomeia a pasta. Campos desconhecidos no `metadata.json` e no `area.json` são
preservados, então editar à mão ou com outras ferramentas não perde dados.
```

- [ ] **Step 3: Check the result**

Run: `grep -n "Ctrl 2\|Ctrl 1\|Índice de capítulos\|segunda aba" README.md`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README for the single tree with the Manuscrito"
```

---

### Task 14: Cloud server reads chapters from the v2 tree (repo `~/app/timerdev`)

The public page (`kingtimer12.dev`) finds a chapter link's text through `metadata.chapters`, which v2 books no longer write, and its workspace walk does not know `manuscript`/`chapter` nodes. Without this task, chapter links of migrated books stop resolving after their next backup. This task runs in the **other repository** (`/Users/aaronyanoliveirasaldanha/app/timerdev`, Bun); follow its `CLAUDE.md` (`bun test`) and its convention of Portuguese comments. Deploy it before (or together with) the app release that contains Tasks 1–13.

**Files:**
- Modify: `/Users/aaronyanoliveirasaldanha/app/timerdev/src/server/scribalis/book.ts`
- Create: `/Users/aaronyanoliveirasaldanha/app/timerdev/src/server/scribalis/book.test.ts`

**Interfaces:**
- Consumes: the v2 `area/area.json` shape from Task 1 (`manuscript` first; `chapter` nodes with book-relative `file`, `status`, `words`).
- Produces: `chapterList(meta: Metadata, area: string | null): ChapterEntry[]` (v2 tree first, `meta.chapters` for v1); `targetExists` and `buildShareView` use it; the workspace view shows the Manuscrito as a `folder` and chapters as `text` nodes (the public page's `ShareNode` kinds are unchanged).

- [ ] **Step 1: Write the failing test**

Create `src/server/scribalis/book.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildShareView, targetExists, type Manifest, type Metadata } from "./book";

const meta: Metadata = { id: "b1", title: "Obra", author: "A", separator: { type: "text", text: "* * *" } };
const area = {
  version: 2,
  items: [
    { id: "m", kind: "manuscript", title: "Manuscrito", notes: "", children: [
      { id: "p", kind: "folder", title: "Parte 1", notes: "", children: [
        { id: "c1", kind: "chapter", title: "Início", notes: "nota", file: "capitulos/c1.md", status: "pronto", words: 2 },
      ] },
      { id: "c2", kind: "chapter", title: "", notes: "", file: "capitulos/c2.md", status: "rascunho", words: 1 },
    ] },
    { id: "t", kind: "text", title: "Ana", notes: "", file: "arquivos/t.md" },
  ],
};
const files: Record<string, string> = {
  "metadata.json": JSON.stringify(meta),
  "area/area.json": JSON.stringify(area),
  "capitulos/c1.md": "Era uma\n",
  "capitulos/c2.md": "Fim\n",
  "area/arquivos/t.md": "Olhos cinzentos.\n",
};
const manifest: Manifest = new Map(
  Object.entries(files).map(([p, t], i) => [p, { hash: String(i).padStart(64, "0"), size: t.length }]),
);
const opts = (kind: "chapter" | "workspace", target: string | null) => ({
  kind, target, includeNotes: true, manifest, createdAt: 1,
  readText: async (p: string) => files[p] ?? null,
  url: (h: string) => "/blob/" + h,
});

describe("v2 books: chapters in the Manuscrito", () => {
  test("a chapter link finds its chapter in the tree, numbered in reading order", async () => {
    expect(targetExists("chapter", "c2", meta, files["area/area.json"])).toBe(true);
    expect(targetExists("chapter", "t", meta, files["area/area.json"])).toBe(false);
    const out = await buildShareView(opts("chapter", "c2"));
    expect(out!.view.chapter).toMatchObject({ id: "c2", number: 2, markdown: "Fim\n", status: "rascunho" });
  });

  test("v1 books still resolve through metadata.chapters", () => {
    const v1: Metadata = { ...meta, chapters: [{ id: "x", file: "capitulos/x.md" }] };
    expect(targetExists("chapter", "x", v1, null)).toBe(true);
  });

  test("the workspace view shows the Manuscrito as a folder and chapters as texts", async () => {
    const out = await buildShareView(opts("workspace", null));
    const [m, t] = out!.view.workspace!.items;
    expect(m).toMatchObject({ kind: "folder", title: "Manuscrito" });
    expect(m.children![0].children![0]).toMatchObject({ id: "c1", kind: "text", text: "Era uma\n" });
    expect(t).toMatchObject({ kind: "text", text: "Olhos cinzentos.\n" });
  });
});
```

Run: `cd /Users/aaronyanoliveirasaldanha/app/timerdev && bun test src/server/scribalis/book.test.ts`
Expected: FAIL — `targetExists("chapter", "c2", …)` is false (no `metadata.chapters`), the workspace view has kind `manuscript`.

- [ ] **Step 2: Read chapters from the tree**

In `src/server/scribalis/book.ts`, widen the tree node type:

```ts
type AreaNode = {
  id: string;
  kind: ShareNode["kind"] | "manuscript" | "chapter";
  title?: string;
  notes?: string;
  /** Capítulos: relativo à pasta da obra; o resto: relativo a `area/`. */
  file?: string;
  status?: string;
  words?: number;
  children?: AreaNode[];
};
```

Add after `findNode`:

```ts
function collectChapters(nodes: AreaNode[], out: ChapterEntry[]) {
  for (const n of nodes) {
    if (n.kind === "chapter" && n.file) {
      out.push({ id: n.id, file: n.file, title: n.title, status: n.status, notes: n.notes, words: n.words });
    }
    collectChapters(n.children ?? [], out);
  }
}

/** Capítulos em ordem de leitura: o Manuscrito da árvore (obra v2) ou `metadata.chapters` (obra v1). */
export function chapterList(meta: Metadata, area: string | null): ChapterEntry[] {
  const items = parseArea(area);
  const m = items[0]?.kind === "manuscript" ? items[0] : null;
  if (!m) return meta.chapters ?? [];
  const out: ChapterEntry[] = [];
  collectChapters(m.children ?? [], out);
  return out;
}
```

Replace the chapter line of `targetExists`:

```ts
  if (kind === "chapter") return !!target && chapterList(meta, area).some(c => c.id === target);
```

In `buildShareView`, replace `const chapters = meta.chapters ?? [];` with:

```ts
    const chapters = chapterList(meta, await readText(AREA_FILE));
```

and in the workspace `walk`, replace the body of the `for` loop up to `out.push(node);` with:

```ts
      // A página pública conhece pastas e textos: o Manuscrito aparece como pasta, o capítulo como texto.
      const kind: ShareNode["kind"] = n.kind === "manuscript" ? "folder" : n.kind === "chapter" ? "text" : n.kind;
      const node: ShareNode = { id: n.id, kind, title: n.title ?? "" };
      if (includeNotes && n.notes) node.notes = n.notes;
      const path = n.file ? (n.kind === "chapter" ? n.file : AREA_DIR + n.file) : null;
      if (kind === "folder") node.children = await walk(n.children ?? []);
      else if (kind === "text" && path) {
        const size = manifest.get(path)?.size ?? 0;
        if (size <= budget) {
          budget -= size;
          node.text = (await readText(path)) ?? "";
          addImages(node.text);
        }
      } else if (path) {
        const u = fileUrl(path);
        if (u) {
          node.url = u;
          node.size = manifest.get(path)?.size;
        }
      }
      out.push(node);
```

A share targeting a folder inside the Manuscrito keeps working: `roots = n.kind === "folder" ? …` — change that line to `roots = n.kind === "folder" || n.kind === "manuscript" ? (n.children ?? []) : [n];`.

- [ ] **Step 3: Run the server tests**

Run: `cd /Users/aaronyanoliveirasaldanha/app/timerdev && bun test`
Expected: PASS (the new file and the existing `api.test.ts`, whose v1 fixtures still resolve through `metadata.chapters`).

- [ ] **Step 4: Commit (in the timerdev repo)**

```bash
cd /Users/aaronyanoliveirasaldanha/app/timerdev
git add src/server/scribalis/book.ts src/server/scribalis/book.test.ts
git commit -m "feat(scribalis): read chapters from the v2 tree (Manuscrito)"
```

---
## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Tree v2: `chapter`/`manuscript` kinds, fields, unknown fields kept | 1 |
| Manuscrito rules (fixed, no delete/rename/move/sibling before, only chapters and folders) | 1 (pure), 4 (enforced in ops), 8 (mock copy) |
| DFS order, continuous numbering, previous/next | 1, 4 (`chapter_neighbor`), 7 (display), 8 (`Alt ↑ ↓`) |
| Move in/out converts, id kept, media refused with status-bar message | 3, 4, 8 (drag), 10 (menus) |
| `metadata.json` without `chapters`, `cur` → `open` | 2, 4 |
| Chapter-only features (frame, separator, status, words, goal, Enter ×3 in the same folder, copy, link) | 4, 8, 12 |
| Migration (backup copy, same ids/order/fields, atomic writes, failure message, once) | 2, 4 (`with_book` → `open_book`) |
| New books and samples born v2 | 6 |
| Book screen: no tabs, sidebar default open, « / `Ctrl E` per book in Rust prefs, "+ Novo", rows with status and words, Manuscrito total, notes drawer, focus mode, opening `open` | 8, 9, 10 |
| Theme button (moon/sun, tooltip, `Ctrl J`, reduced motion) | 11 |
| Context menus per type, share on chapter, double delete, folder chapter count | 10 |
| What goes away (tabs, `ChapterIndex`, "Enviar capítulo…", index code) | 8 |
| Palette and help updates | 8, 9, 12 |
| Cloud: same `nodeId`, comments into node notes, backup unchanged, old snapshot migrates on open, public page | 4 (restore), 5, 14 |
| Scrivener into the Manuscrito, append when importing into an open book | 6 |
| README | 13 |

**Rulings on points the spec leaves open**
- Pure Manuscrito rules live in a new `model/manuscript.rs` next to `model/workspace.rs` (one mod per subject) instead of inside `workspace.rs`.
- The book keeps at least one chapter: deleting or moving out the last one (or the folder holding all of them) is refused with the existing message.
- A new book's chapter has an empty title and shows as "Capítulo 1" in the tree (like the editor label), instead of storing the text "Capítulo 1" as its title.
- A chapter moved out goes to `area/arquivos/<id>.md` (spec); texts created directly keep today's `area/<id>.md`.
- "Status ›" and "Novo ›" submenus are flattened into plain items (the context menu has no submenus).
- Scrivener: chosen items become chapters at the end of the Manuscrito in binder order (no part folders); what is left of the Draft stays a plain folder titled "<Draft> (Scrivener)".
- `Alt Shift ↑ ↓` stays, moving the open chapter among its siblings.
- The cloud server must read chapters from `area.json` v2 (Task 14, other repo), or chapter links break after the next backup.

**Checks done:** every code step shows full code; types and names match across tasks (`Created`, `move_converting`, `open_book`, `peek_tree`, `summarize`, `openNode`, `openFirstChapter`, `expand`/`reveal`, `moveTo`, `newMenu`, `themeButton`); each Review Focus item has its test in the owning task; `tsconfig` has `noUnusedLocals`, so the import lists were written against the final code of each file.

**Execution:** the Rust tasks (1–6) keep `cargo test` green at every commit; the desktop webview only matches the new commands from Task 8 on, so run Tasks 4–8 back to back before trying `bun run tauri dev`. Task 14 is in another repository and must be deployed with the release.
