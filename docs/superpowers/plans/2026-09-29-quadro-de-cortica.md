# Quadro de cortiça e index cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every tree node gets a **Sinopse**; the Scrivener import fills it; opening a folder or the Manuscrito shows its children as index cards (the Quadro de cortiça) with the synopsis editable on each card.

**Architecture:** Rust owns the data: `Node.synopsis` in `area.json` (additive, skipped when empty), a `workspace_set_synopsis` command that cuts at 2000 characters, and the Scrivener reader split into `Project::synopsis` / `Project::notes`. The webview only shows it: a debounced synopsis save joins `flushAll` (`store/actions/synopsis.ts`), `openNode` now opens containers as a board (kept in `areaOpen`, remembered like any node), and `components/corkboard/` renders the grid, cards, card drag (reusing `dropTarget` + `moveNode`) and board keys (`store/keys/board.ts`, grid math in `lib/grid.ts`).

**Tech Stack:** Rust (Tauri 2, serde, tempfile for tests), SolidJS, Tailwind v4 + plain CSS layers, vitest (jsdom, the in-memory mock API; store-level and pure tests, no component rendering), bun.

**Spec:** `docs/superpowers/specs/2026-09-29-quadro-de-cortica-design.md`

## Global Constraints

- Comments in English in every language (TS, Rust, CSS); UI text in Portuguese (`CLAUDE.md`).
- No god files: one responsibility per file; one Rust `mod` per subject (`CLAUDE.md`).
- Data and data processing stay in Rust; the webview holds only screen state and the open document (`CLAUDE.md`).
- Every task ends with a commit. Commit messages have **no** `Co-Authored-By` line and no attribution of any kind. Stage explicit paths only.
- `Node.synopsis: String` with `#[serde(default, skip_serializing_if = "String::is_empty")]`. Books stay `area.json` version **2**; no migration.
- Synopsis limit: **2000 characters**. Rust cuts (by `char`), the front blocks typing with `maxlength`.
- Synopsis is never in `metadata.chapters` (the mirror) and changes nothing on the server.
- Scrivener: synopsis from `Files/Data/<UUID>/synopsis.txt` (v3) or `Files/Docs/<id>_synopsis.txt` (v2), plain text, `trim`. `Project::notes` no longer contains it.
- Composite chapter (`gather`): the chapter's synopsis is the top item's; each descendant's synopsis goes into the chapter notes as `Título: sinopse`.
- Books imported before this change stay as they are (synopsis inside notes).
- UI strings, verbatim: "Escreva uma sinopse…", "Arquivo não encontrado", "Pasta vazia", "+ Novo", "N itens" (via `plural`), "Sinopse", "Capítulo N" (via `displayTitle`).
- Board grid: min card width ~220px, 5×3 card ratio. `prefers-reduced-motion`: no transitions on the board.
- No new dependencies (Rust or JS).
- Commands: Rust tests `cargo test --manifest-path src-tauri/Cargo.toml`; front tests `bun run test`; typecheck `./node_modules/.bin/tsc --noEmit -p .` (on Windows the binary is `tsc.exe`).

## Review Focus

1. **A synopsis with accents or emoji longer than 2000 characters:** Rust cuts by character (never inside a UTF-8 sequence, no panic), the mock does the same. Covered by `set_synopsis_saves_and_cuts_long_text` (Task 1) and the mock test (Task 3).
2. **Typing a synopsis on a card and switching book (or closing the window) before the debounce fires:** the text lands in the book it was typed in. Covered by `flushAll saves a pending synopsis to its own book` (Task 4).
3. **Keys typed inside a card's synopsis (N, Delete, arrows, Enter, Esc):** never reach the board, the tree or the global shortcuts. Covered by `ignores keys typed into a card's synopsis` (Task 6); the textarea also stops propagation (Task 8).
4. **Reopening a book whose last open node was a folder or the Manuscrito:** the board comes back instead of the first chapter. Covered by `reopens a remembered folder or Manuscrito board` (Task 5).
5. **A Scrivener folder whose children all became chapters but which has a synopsis:** kept (it carries text), not dropped as an empty shell. Covered by `a_folder_left_empty_keeps_itself_when_it_has_a_synopsis` (Task 2).

---

### Task 1: `Node.synopsis` and `workspace_set_synopsis` (Rust)

**Files:**
- Modify: `src-tauri/src/model/workspace.rs` (field, `SYNOPSIS_MAX`, `Node::folder`, test)
- Modify: `src-tauri/src/ops/workspace.rs` (`set_synopsis`, test)
- Modify: `src-tauri/src/commands/workspace.rs` (command)
- Modify: `src-tauri/src/lib.rs:77` (register the command)

**Interfaces:**
- Produces: `pub const SYNOPSIS_MAX: usize = 2000;` in `model::workspace`; `Node.synopsis: String`; `ops::workspace::set_synopsis(dir: &Path, id: &str, synopsis: &str) -> AppResult<Vec<Node>>`; Tauri command `workspace_set_synopsis { bookId, id, synopsis } -> Vec<Node>`.

- [ ] **Step 1: Write the failing tests**

In `src-tauri/src/model/workspace.rs`, inside `mod tests`, add:

```rust
    #[test]
    fn synopsis_is_optional_on_disk() {
        let n: Node = serde_json::from_str(r#"{"id":"a","kind":"folder","title":"P","notes":""}"#).unwrap();
        assert_eq!(n.synopsis, "");
        assert!(serde_json::to_value(&n).unwrap().get("synopsis").is_none());
        let n = Node { synopsis: "Resumo".into(), ..n };
        let v = serde_json::to_value(&n).unwrap();
        assert_eq!(v["synopsis"], "Resumo");
        assert!(v.get("extra").is_none());
        assert_eq!(serde_json::from_value::<Node>(v).unwrap(), n);
    }
```

In `src-tauri/src/ops/workspace.rs`, inside `mod tests`, add:

```rust
    #[test]
    fn set_synopsis_saves_and_cuts_long_text() {
        let (_r, dir) = book();
        let m = manuscript_id(&dir);
        let items = set_synopsis(&dir, &m, "A história toda").unwrap();
        assert_eq!(find(&items, &m).unwrap().synopsis, "A história toda");
        assert_eq!(find(&tree(&dir).unwrap(), &m).unwrap().synopsis, "A história toda");
        // Multi-byte characters: cut by character, never inside one.
        let long = "é".repeat(SYNOPSIS_MAX + 5);
        let items = set_synopsis(&dir, &m, &long).unwrap();
        assert_eq!(find(&items, &m).unwrap().synopsis.chars().count(), SYNOPSIS_MAX);
        // Clearing it drops the field from disk.
        set_synopsis(&dir, &m, "").unwrap();
        let raw = std::fs::read_to_string(dir.join(AREA_DIR).join("area.json")).unwrap();
        assert!(!raw.contains("synopsis"));
        assert_eq!(set_synopsis(&dir, "zz", "x").unwrap_err().0, "Item não encontrado");
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml synopsis`
Expected: compile error (`no field synopsis on type Node`, `cannot find function set_synopsis`).

- [ ] **Step 3: Implement**

`src-tauri/src/model/workspace.rs` — below `IMAGE_EXTENSIONS`:

```rust
/// Longest synopsis kept, in characters: an index card holds a short summary.
pub const SYNOPSIS_MAX: usize = 2000;
```

In `struct Node`, right after `notes`:

```rust
    /// Short summary shown on the node's index card; absent from disk when empty.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub synopsis: String,
```

In `Node::folder`, after `notes: String::new(),` add `synopsis: String::new(),`.

`src-tauri/src/ops/workspace.rs` — extend the model import to
`workspace::{find, find_mut, insert, remove, subtree_files, Node, NodeKind, SYNOPSIS_MAX},` and add after `set_notes`:

```rust
/// Index card summary of any node, the Manuscrito included, cut to `SYNOPSIS_MAX` characters.
pub fn set_synopsis(dir: &Path, id: &str, synopsis: &str) -> AppResult<Vec<Node>> {
    let synopsis: String = synopsis.chars().take(SYNOPSIS_MAX).collect();
    edit(dir, |items| {
        find_mut(items, id).ok_or_else(not_found)?.synopsis = synopsis;
        Ok(())
    })
}
```

`src-tauri/src/commands/workspace.rs` — after `workspace_set_notes`:

```rust
#[tauri::command]
pub async fn workspace_set_synopsis(
    state: State<'_, SharedLibrary>,
    book_id: String,
    id: String,
    synopsis: String,
) -> AppResult<Vec<Node>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::set_synopsis(dir, &id, &synopsis))
}
```

`src-tauri/src/lib.rs` — after `workspace::workspace_set_notes,` add `workspace::workspace_set_synopsis,`.

If any other `Node { … }` literal without `..` fails to compile, add `synopsis: String::new(),` there (only `Node::folder` is expected).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all PASS (existing `json_shape_and_unknown_fields_survive` still passes: an empty synopsis is not written).

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/model/workspace.rs src-tauri/src/ops/workspace.rs src-tauri/src/commands/workspace.rs src-tauri/src/lib.rs
git commit -m "feat(workspace): synopsis field on every node and workspace_set_synopsis"
```

---

### Task 2: Scrivener import fills the synopsis (Rust)

**Files:**
- Modify: `src-tauri/src/scrivener/project.rs` (`synopsis`, `notes` without synopsis, tests)
- Modify: `src-tauri/src/scrivener/import.rs` (every node gets its item's synopsis; `gather`; tests)

**Interfaces:**
- Consumes: `Node.synopsis`, `SYNOPSIS_MAX` (Task 1).
- Produces: `Project::synopsis(&self, key: &str) -> String` (trimmed, cut to `SYNOPSIS_MAX`); `Project::notes(&self, key: &str) -> String` now returns only the document notes.

- [ ] **Step 1: Write / update the failing tests**

`src-tauri/src/scrivener/project.rs`, test `opens_scrivener3_by_folder_or_scrivx`: replace
`assert_eq!(project.notes("A-1"), "Resumo\n\nNota");` with

```rust
            assert_eq!(project.notes("A-1"), "Nota");
            assert_eq!(project.synopsis("A-1"), "Resumo");
```

Test `opens_scrivener2_layout_and_media`: after the `3_notes.rtf` write add
`fs::write(dir.join("Files/Docs/3_synopsis.txt"), "  Sinopse velha \n").unwrap();` and after
`assert_eq!(project.notes("3"), "N");` add:

```rust
        assert_eq!(project.synopsis("3"), "Sinopse velha");
        assert_eq!(project.synopsis("99"), "");
        assert_eq!(project.synopsis("../x"), "");
```

`src-tauri/src/scrivener/import.rs`, fixture `project()`: after `put("S1", "synopsis.txt", b"Abertura");` add

```rust
        put("C1", "synopsis.txt", "Chegada ao porto".as_bytes());
        put("N1", "synopsis.txt", "A heroína".as_bytes());
```

Test `new_book_gets_chapters_and_workspace`: replace
`assert_eq!((list[0].0.as_str(), list[0].1.as_str()), ("Capítulo 1", "Abertura"));` with

```rust
        // The chapter keeps its top item's synopsis; the scenes' go into its notes.
        assert_eq!((list[0].0.as_str(), list[0].1.as_str()), ("Capítulo 1", "Cena 1: Abertura"));
```

and, after the line `assert_eq!((research.children[0].kind, research.children[0].notes.as_str()), (NodeKind::Text, "Protagonista"));` add:

```rust
        assert_eq!(chapters(&ws.items)[0].synopsis, "Chegada ao porto");
        assert_eq!(research.children[0].synopsis, "A heroína");
```

Test `only_the_chosen_items_become_chapters`: after `assert_eq!(list[1].1, "Protagonista");` add

```rust
        // A chapter from a single item: synopsis in its own field, never in the notes.
        assert_eq!(chapters(&read_workspace(&dir).unwrap().items)[1].synopsis, "A heroína");
```

and after `assert_eq!(chapter1.title, "Capítulo 1");` add `assert_eq!(chapter1.synopsis, "Chegada ao porto");`.

New test at the end of `mod tests`:

```rust
    #[test]
    fn a_folder_left_empty_keeps_itself_when_it_has_a_synopsis() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path().join("Sin.scriv");
        let data = dir.join("Files/Data");
        for key in ["F", "T"] {
            fs::create_dir_all(data.join(key)).unwrap();
        }
        fs::write(dir.join("Sin.scrivx"), r#"<ScrivenerProject><Binder>
          <BinderItem UUID="F" Type="Folder"><Title>Parte</Title><Children>
            <BinderItem UUID="T" Type="Text"><Title>Cena</Title></BinderItem>
          </Children></BinderItem>
        </Binder></ScrivenerProject>"#).unwrap();
        fs::write(data.join("F/synopsis.txt"), "Onde tudo começa").unwrap();
        fs::write(data.join("T/content.rtf"), br"{\rtf1 Texto.\par}").unwrap();
        let p = Project::open(&dir).unwrap();
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (book, _meta, out) = import_new_book(&root, &p, &folders(&["T"])).unwrap();
        assert_eq!(out.chapters, 1);
        let ws = read_workspace(&book).unwrap();
        assert_eq!((ws.items[1].title.as_str(), ws.items[1].synopsis.as_str()), ("Parte", "Onde tudo começa"));
        assert!(ws.items[1].children.is_empty());
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scrivener`
Expected: compile error (`no method named synopsis`), then (after it exists) assertion failures on notes/synopsis.

- [ ] **Step 3: Implement `project.rs`**

Import `use crate::model::{doc::Doc, workspace::SYNOPSIS_MAX};` (replacing `use crate::model::doc::Doc;`). Replace `notes` with:

```rust
    fn side_bytes(&self, key: &str, v3_name: &str, v2_suffix: &str) -> Option<Vec<u8>> {
        self.side_file(key, v3_name, v2_suffix).and_then(|p| read_optional(&p).ok().flatten())
    }

    /// The item's synopsis (plain text, trimmed, cut like the app's own); "" when absent or unreadable.
    pub fn synopsis(&self, key: &str) -> String {
        self.side_bytes(key, "synopsis.txt", "_synopsis.txt")
            .map(|b| String::from_utf8_lossy(&b).trim().chars().take(SYNOPSIS_MAX).collect())
            .unwrap_or_default()
    }

    /// The item's document notes as plain text; "" when absent or unreadable.
    pub fn notes(&self, key: &str) -> String {
        self.side_bytes(key, "notes.rtf", "_notes.rtf")
            .map(|b| doc_text(&rtf_to_doc(&b)).trim().to_string())
            .unwrap_or_default()
    }
```

- [ ] **Step 4: Implement `import.rs`**

`text_node` takes the synopsis too:

```rust
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
```

In `media_node`, after `node.notes = …;` add `node.synopsis = self.project.synopsis(&item.key);`.

In `node()`:
- `ItemKind::Text if item.children.is_empty()` arm:

```rust
            ItemKind::Text if item.children.is_empty() => {
                let doc = self.text(&item.key);
                let notes = self.project.notes(&item.key);
                let synopsis = self.project.synopsis(&item.key);
                self.text_node(&title_of(item), notes, synopsis, &doc).map(Some)
            }
```

- media-with-children arm: after `let mut folder = Node::folder(new_id(), &title_of(item));` add
  `folder.synopsis = self.project.synopsis(&item.key);`.
- generic folder arm: after `let notes = self.project.notes(&item.key);` add
  `let synopsis = self.project.synopsis(&item.key);`, set `folder.synopsis = synopsis.clone();`
  right after creating `folder`, call `self.text_node(&title, notes, synopsis, &doc)?` in the `own_text` branch, and extend the empty-shell test to

```rust
                if !own_text
                    && folder.children.is_empty()
                    && !item.children.is_empty()
                    && folder.notes.is_empty()
                    && folder.synopsis.is_empty()
                {
```

`gather` gets a `top` flag; descendants' synopses become notes lines:

```rust
    /// Depth-first texts and notes under `item` (itself included); media go to attachments.
    /// Below the top item, each synopsis joins the notes as "Título: sinopse".
    fn gather(&mut self, item: &BinderItem, top: bool, blocks: &mut Vec<Block>, notes: &mut Vec<String>) -> AppResult<()> {
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
                self.gather(child, false, blocks, notes)?;
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
        if !top {
            let s = self.project.synopsis(&item.key);
            if !s.is_empty() {
                notes.push(format!("{}: {s}", title_of(item)));
            }
        }
        let n = self.project.notes(&item.key);
        if !n.is_empty() {
            notes.push(n);
        }
        for child in &item.children {
            self.gather(child, false, blocks, notes)?;
        }
        Ok(())
    }
```

`emit_chapter`:

```rust
    fn emit_chapter(&mut self, item: &BinderItem) -> AppResult<()> {
        let (mut blocks, mut notes) = (Vec::new(), Vec::new());
        self.gather(item, true, &mut blocks, &mut notes)?;
        let mut node = new_chapter(self.dir, &title_of(item), &Doc::new(blocks))?;
        node.notes = notes.join("\n\n");
        node.synopsis = self.project.synopsis(&item.key);
        self.chapters.push(node);
        Ok(())
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/scrivener/project.rs src-tauri/src/scrivener/import.rs
git commit -m "feat(scrivener): import synopses into the synopsis field, not the notes"
```

---

### Task 3: Front API, type, constant and mock

**Files:**
- Modify: `src/api/types.ts` (`AreaNode.synopsis?`)
- Modify: `src/lib/constants.ts` (`SYNOPSIS_MAX`)
- Modify: `src/api/workspace.ts` (`areaSetSynopsis`)
- Modify: `src/api/mock/workspace.ts` (`workspace_set_synopsis`)
- Test: `src/api/mock/workspace.test.ts` (create)

**Interfaces:**
- Consumes: command `workspace_set_synopsis` (Task 1).
- Produces: `AreaNode.synopsis?: string`; `SYNOPSIS_MAX = 2000`; `areaSetSynopsis(bookId: string, id: string, synopsis: string): Promise<AreaNode[]>`.

- [ ] **Step 1: Write the failing test** — `src/api/mock/workspace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SYNOPSIS_MAX } from "../../lib/constants";
import type { AreaNode, BookMeta, BookSummary } from "../types";
import { mockInvoke } from "./index";

describe("workspace_set_synopsis (mock)", () => {
  it("saves any node's synopsis, cut at SYNOPSIS_MAX characters like Rust", async () => {
    const created = await mockInvoke<BookSummary>("library_create", { title: "Sinopse" });
    const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
    const m = (await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id }))[0].id;
    let items = await mockInvoke<AreaNode[]>("workspace_set_synopsis", { bookId: book.id, id: m, synopsis: "Tudo" });
    expect(items[0].synopsis).toBe("Tudo");
    items = await mockInvoke<AreaNode[]>("workspace_set_synopsis", {
      bookId: book.id, id: m, synopsis: "é".repeat(SYNOPSIS_MAX + 3),
    });
    expect(Array.from(items[0].synopsis ?? "").length).toBe(SYNOPSIS_MAX);
    await expect(mockInvoke("workspace_set_synopsis", { bookId: book.id, id: "zz", synopsis: "x" })).rejects.toBe(
      "Item não encontrado",
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test src/api/mock/workspace.test.ts`
Expected: FAIL (`SYNOPSIS_MAX` not exported / unknown mock command).

- [ ] **Step 3: Implement**

`src/api/types.ts`, in `AreaNode` after `notes: string;`:

```ts
  /** Index card summary; absent when empty. */
  synopsis?: string;
```

`src/lib/constants.ts`:

```ts
/** Longest synopsis, in characters (Rust cuts at the same length). */
export const SYNOPSIS_MAX = 2000;
```

`src/api/workspace.ts`, after `areaSetNotes`:

```ts
/** Index card summary of any node (the Manuscrito included); Rust cuts it at `SYNOPSIS_MAX`. */
export const areaSetSynopsis = (bookId: string, id: string, synopsis: string) =>
  call<AreaNode[]>("workspace_set_synopsis", { bookId, id, synopsis });
```

`src/api/mock/workspace.ts`: import `import { SYNOPSIS_MAX } from "../../lib/constants";` and add after `workspace_set_notes`:

```ts
  workspace_set_synopsis: ({ bookId, id, synopsis }: Ids & { synopsis: string }): AreaNode[] => {
    const b = findBook(bookId);
    const node = find(b.area, id);
    if (!node) notFound();
    // By code point, like Rust's `chars().take(..)`.
    node.synopsis = Array.from(synopsis).slice(0, SYNOPSIS_MAX).join("");
    touch(b);
    return b.area;
  },
```

If `mockInvoke` rejects with something other than the thrown string, match what `src/api/mock/chapter.test.ts` asserts for errors and adapt the last `expect`.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test src/api/mock/workspace.test.ts && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/lib/constants.ts src/api/workspace.ts src/api/mock/workspace.ts src/api/mock/workspace.test.ts
git commit -m "feat(api): areaSetSynopsis and its mock"
```

---

### Task 4: Debounced synopsis save joining `flushAll`

**Files:**
- Create: `src/test/newBook.ts` (shared test helper)
- Create: `src/store/actions/synopsis.ts`
- Test: `src/store/actions/synopsis.test.ts`

**Interfaces:**
- Consumes: `areaSetSynopsis`, `SYNOPSIS_MAX` (Task 3); `registerFlusher`, `flushAll` (`store/saving.ts`); `editNode`, `state` (`store/state.ts`); `run` (`store/actions/run.ts`).
- Produces: `scheduleSynopsis(id: string, synopsis: string): void`; `flushSynopsis(): Promise<void> | undefined`; test helper `newBook(): Promise<BookMeta>`.

- [ ] **Step 1: Create the helper** — `src/test/newBook.ts`:

```ts
import { mockInvoke } from "../api/mock";
import type { AreaNode, BookMeta, BookSummary } from "../api/types";
import { setState } from "../store/state";

/** A fresh mock book with its tree in the store, isolated from the samples and other tests. */
export async function newBook(): Promise<BookMeta> {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
  const area = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id });
  setState({
    book, area, areaSel: null, areaOpen: null, areaExpanded: [],
    areaRenaming: null, areaRenameVal: "", toast: "", focus: false,
  });
  return book;
}
```

- [ ] **Step 2: Write the failing tests** — `src/store/actions/synopsis.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { AreaNode } from "../../api/types";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { findNode } from "../../lib/tree";
import { newBook } from "../../test/newBook";
import { flushAll } from "../saving";
import { state } from "../state";
import { flushSynopsis, scheduleSynopsis } from "./synopsis";

const saved = async (bookId: string, id: string) =>
  findNode(await mockInvoke<AreaNode[]>("workspace_tree", { bookId }), id)?.synopsis;

describe("synopsis", () => {
  it("shows at once and saves on flush", async () => {
    const book = await newBook();
    const m = state.area[0].id;
    scheduleSynopsis(m, "A história toda");
    expect(findNode(state.area, m)?.synopsis).toBe("A história toda");
    expect(await saved(book.id, m)).toBeUndefined();
    await flushSynopsis();
    expect(await saved(book.id, m)).toBe("A história toda");
  });

  it("flushAll saves a pending synopsis to its own book, even after a book switch", async () => {
    const first = await newBook();
    const m = state.area[0].id;
    scheduleSynopsis(m, "nao perder");
    await newBook();
    await flushAll();
    expect(await saved(first.id, m)).toBe("nao perder");
  });

  it("typing into another node's synopsis lands the previous one first", async () => {
    const book = await newBook();
    const m = state.area[0].id;
    const chapter = state.area[0].children![0].id;
    scheduleSynopsis(m, "do manuscrito");
    scheduleSynopsis(chapter, "do capítulo");
    await flushSynopsis();
    expect(await saved(book.id, m)).toBe("do manuscrito");
    expect(await saved(book.id, chapter)).toBe("do capítulo");
  });

  it("never shows more than SYNOPSIS_MAX characters", async () => {
    await newBook();
    const m = state.area[0].id;
    scheduleSynopsis(m, "x".repeat(SYNOPSIS_MAX + 10));
    expect(findNode(state.area, m)?.synopsis?.length).toBe(SYNOPSIS_MAX);
    await flushSynopsis();
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `bun run test src/store/actions/synopsis.test.ts`
Expected: FAIL (module `./synopsis` not found).

- [ ] **Step 4: Implement** — `src/store/actions/synopsis.ts`:

```ts
import { areaSetSynopsis } from "../../api/workspace";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { registerFlusher } from "../saving";
import { editNode, state } from "../state";
import { run } from "./run";

// The synopsis of any node, typed on its index card or in the notes drawer: shown at once,
// saved a moment later. The book is bound when typed: a book switch before the flush must
// not redirect it.

const DELAY = 300;

let pending: { bookId: string; id: string; synopsis: string; timer: ReturnType<typeof setTimeout> } | null = null;

export function scheduleSynopsis(id: string, synopsis: string) {
  const bookId = state.book?.id;
  if (!bookId) return;
  const text = Array.from(synopsis).slice(0, SYNOPSIS_MAX).join("");
  if (pending && (pending.id !== id || pending.bookId !== bookId)) void flushSynopsis();
  if (pending) clearTimeout(pending.timer);
  editNode(id, (n) => (n.synopsis = text));
  pending = { bookId, id, synopsis: text, timer: setTimeout(() => void flushSynopsis(), DELAY) };
}

/** Saves the pending synopsis now, if any: on leaving the field, closing the drawer and in `flushAll`. */
export function flushSynopsis() {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  // The tree already shows the text: only the write is left.
  return run(async () => {
    await areaSetSynopsis(p.bookId, p.id, p.synopsis);
  });
}
registerFlusher(flushSynopsis);
```

- [ ] **Step 5: Run to verify they pass**

Run: `bun run test src/store/actions/synopsis.test.ts && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/test/newBook.ts src/store/actions/synopsis.ts src/store/actions/synopsis.test.ts
git commit -m "feat(store): debounced synopsis save that joins flushAll"
```

---

### Task 5: Opening a folder or the Manuscrito opens its board

**Files:**
- Modify: `src/store/focus.ts` (`"board"` target)
- Modify: `src/store/actions/open.ts` (`openNode`, `initialNode`)
- Modify: `src/store/actions/ui.ts` (`toggleFocusMode` guard)
- Test: `src/store/actions/open.test.ts` (initialNode), `src/store/actions/board.test.ts` (create)

**Interfaces:**
- Consumes: `newBook` (Task 4); `expand`, `toggleExpanded` (`store/actions/expanded.ts`); `openAreaNode` (`store/selectors/workspace.ts`).
- Produces: `FocusTarget` includes `"board"`; `openNode(containerId, focusBody)` sets `areaOpen` to the container, expands it, remembers it in `book.open`, turns focus mode off, and focuses `"board"` when `focusBody`; calling it again on the already open container toggles its expansion. `initialNode` returns a remembered container.

- [ ] **Step 1: Write the failing tests**

`src/store/actions/open.test.ts`, inside `describe("initialNode")`:

```ts
  it("reopens a remembered folder or Manuscrito board", () => {
    expect(initialNode(items, "m")?.id).toBe("m");
  });
```

`src/store/actions/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { newBook } from "../../test/newBook";
import { setState, state } from "../state";
import { openNode } from "./open";
import { toggleFocusMode } from "./ui";
import { cancelNodeRename, createNode } from "./workspace";

describe("opening a board", () => {
  it("opens a folder's board, unfolds it and remembers it; opening it again folds it", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const id = state.area[1].id;
    await openNode(id, false);
    expect(state.areaOpen).toBe(id);
    expect(state.areaSel).toBe(id);
    expect(state.areaExpanded).toContain(id);
    expect(state.book?.open).toBe(id);
    await openNode(id, false);
    expect(state.areaOpen).toBe(id);
    expect(state.areaExpanded).not.toContain(id);
  });

  it("the Manuscrito opens as a board and leaves focus mode", async () => {
    await newBook();
    setState("focus", true);
    await openNode(state.area[0].id, false);
    expect(state.areaOpen).toBe(state.area[0].id);
    expect(state.focus).toBe(false);
  });

  it("focus mode does not turn on over a board", async () => {
    await newBook();
    await openNode(state.area[0].id, false);
    toggleFocusMode();
    expect(state.focus).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test src/store/actions/open.test.ts src/store/actions/board.test.ts`
Expected: FAIL (`initialNode(items, "m")` gives the first chapter; `areaOpen` stays null after opening a folder).

- [ ] **Step 3: Implement**

`src/store/focus.ts`: add `| "board"` to `FocusTarget` (after `"tree"`).

`src/store/actions/open.ts`: import `expand` next to `reveal, toggleExpanded` from `./expanded`. Replace `initialNode`:

```ts
/** Where a book opens: the remembered node when it still exists (a folder shows its board), else the first chapter that is not missing. */
export function initialNode(items: AreaNode[], open: string | null): AreaNode | null {
  const n = open ? findNode(items, open) : null;
  if (n && !n.missing) return n;
  return firstChapter(items);
}
```

Replace the head of `openNode` (doc comment through the `if (!key) { … }` block):

```ts
/**
 * Opens a node in the main pane; a folder or the Manuscrito opens as its board of index
 * cards (a second open of the board's own folder folds or unfolds it in the tree).
 * `focusBody` moves the caret into an opened chapter or text, or the focus onto the board;
 * mouse clicks in the tree pass false so a double click can still reach the rename field.
 */
export function openNode(id: string, focusBody = true) {
  const b = state.book;
  const node = findNode(state.area, id);
  if (!b || !node) return;
  selectNode(id);
  const board = isContainer(node.kind);
  if (board) {
    if (state.areaOpen === id) return toggleExpanded(id);
    expand(id);
  }
  const key = keyOf(b.id, node);
  if (!key) {
    // The editor unmounts: land any pending text first, or its save would find no editor.
    return run(async () => {
      await flushAll();
      await settleDocSave();
      if (state.book?.id !== b.id) return;
      // Index cards hold no text being written: focus mode ends with the board.
      setState({ areaOpen: id, tripleHint: false, ...(board ? { focus: false } : {}) });
      remember(b.id, id);
      if (board && focusBody) focusTarget("board");
    });
  }
```

(The rest of `openNode` stays as is.)

`src/store/actions/ui.ts`: import `import { isContainer } from "../../lib/tree";` and `import { openAreaNode } from "../selectors/workspace";`, then:

```ts
export function toggleFocusMode() {
  const on = !state.focus;
  // A board of index cards has no text being written: focus mode does not apply.
  const open = openAreaNode();
  if (on && open && isContainer(open.kind)) return;
  setState("focus", on);
  flash(on ? "Modo foco" : "Modo foco desligado");
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: all PASS (existing tests that open texts/chapters are unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/store/focus.ts src/store/actions/open.ts src/store/actions/ui.ts src/store/actions/open.test.ts src/store/actions/board.test.ts
git commit -m "feat(store): folders and the Manuscrito open as a board"
```

---

### Task 6: Board keyboard (grid math + `boardKey`)

**Files:**
- Create: `src/lib/grid.ts`, test `src/lib/grid.test.ts`
- Create: `src/store/keys/board.ts`, test `src/store/keys/board.test.ts`

**Interfaces:**
- Consumes: `selectNode`, `openNode` (`store/actions/open.ts`); `focusTarget` (with `"board"`, Task 5); `newBook` (Task 4).
- Produces: `type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End"`; `gridStep(index: number, count: number, cols: number, key: GridKey): number`; `boardKey(e: KeyboardEvent, ids: string[], cols: number, openMenu: () => void): void`.

- [ ] **Step 1: Write the failing tests**

`src/lib/grid.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { gridStep } from "./grid";

// 7 cards, 3 per row:  0 1 2 / 3 4 5 / 6
describe("gridStep", () => {
  it("moves left and right along the reading order, stopping at the ends", () => {
    expect(gridStep(1, 7, 3, "ArrowRight")).toBe(2);
    expect(gridStep(2, 7, 3, "ArrowRight")).toBe(3);
    expect(gridStep(6, 7, 3, "ArrowRight")).toBe(6);
    expect(gridStep(0, 7, 3, "ArrowLeft")).toBe(0);
  });

  it("moves up and down by a row; down into a short last row lands on its last card", () => {
    expect(gridStep(4, 7, 3, "ArrowUp")).toBe(1);
    expect(gridStep(1, 7, 3, "ArrowUp")).toBe(1);
    expect(gridStep(1, 7, 3, "ArrowDown")).toBe(4);
    expect(gridStep(5, 7, 3, "ArrowDown")).toBe(6);
    expect(gridStep(6, 7, 3, "ArrowDown")).toBe(6);
  });

  it("Home and End, no selection and no cards", () => {
    expect(gridStep(4, 7, 3, "Home")).toBe(0);
    expect(gridStep(1, 7, 3, "End")).toBe(6);
    expect(gridStep(-1, 7, 3, "ArrowDown")).toBe(0);
    expect(gridStep(-1, 0, 3, "ArrowRight")).toBe(-1);
    expect(gridStep(2, 7, 0, "ArrowDown")).toBe(3);
  });
});
```

`src/store/keys/board.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { newBook } from "../../test/newBook";
import { cancelNodeRename, createNode } from "../actions/workspace";
import { setState, state } from "../state";
import { boardKey } from "./board";

/** A board element wired like the Corkboard, holding one textarea like a card's synopsis. */
function board(ids: string[], cols: number, openMenu = () => {}) {
  const el = document.createElement("div");
  const field = document.createElement("textarea");
  el.appendChild(field);
  el.addEventListener("keydown", (e) => boardKey(e, ids, cols, openMenu));
  const press = (key: string, from: HTMLElement = el, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    from.dispatchEvent(e);
    return e;
  };
  return { el, field, press };
}

describe("boardKey", () => {
  it("arrows move the selection across the grid", () => {
    setState("areaSel", "a");
    const { press } = board(["a", "b", "c", "d"], 2);
    press("ArrowRight");
    expect(state.areaSel).toBe("b");
    press("ArrowDown");
    expect(state.areaSel).toBe("d");
    press("Home");
    expect(state.areaSel).toBe("a");
  });

  it("ignores keys typed into a card's synopsis", () => {
    setState("areaSel", "a");
    const menu = vi.fn();
    const { field, press } = board(["a", "b"], 2, menu);
    const e = press("ArrowRight", field);
    press("ContextMenu", field);
    expect(state.areaSel).toBe("a");
    expect(e.defaultPrevented).toBe(false);
    expect(menu).not.toHaveBeenCalled();
  });

  it("leaves Ctrl/Alt chords to the global shortcuts", () => {
    setState("areaSel", "a");
    const { press } = board(["a", "b"], 2);
    expect(press("ArrowRight", undefined, { altKey: true }).defaultPrevented).toBe(false);
    expect(state.areaSel).toBe("a");
  });

  it("Enter opens the selected card; the menu key opens its menu", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const folder = state.area[1].id;
    await createNode("text", { parent: folder, index: 0 });
    cancelNodeRename();
    const text = state.area[1].children![0].id;
    const menu = vi.fn();
    setState("areaSel", text);
    const { press } = board([text], 1, menu);
    press("ContextMenu");
    expect(menu).toHaveBeenCalledOnce();
    press("Enter");
    await vi.waitFor(() => expect(state.areaOpen).toBe(text));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test src/lib/grid.test.ts src/store/keys/board.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/lib/grid.ts`:

```ts
/** Keys that move a selection inside a grid of cards laid out in reading order. */
export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

export const isGridKey = (key: string): key is GridKey =>
  key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" || key === "Home" || key === "End";

/**
 * Index the selection moves to among `count` cards laid out `cols` per row. With nothing
 * selected (`index` -1) any key picks the first card; with no cards the answer is -1.
 * Down into a shorter last row lands on its last card.
 */
export function gridStep(index: number, count: number, cols: number, key: GridKey): number {
  if (count === 0) return -1;
  if (index < 0) return 0;
  const c = Math.max(1, cols);
  const last = count - 1;
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, index - 1);
    case "ArrowRight":
      return Math.min(last, index + 1);
    case "ArrowUp":
      return index - c >= 0 ? index - c : index;
    case "ArrowDown":
      if (index + c <= last) return index + c;
      return Math.floor(index / c) < Math.floor(last / c) ? last : index;
    case "Home":
      return 0;
    case "End":
      return last;
  }
}
```

`src/store/keys/board.ts`:

```ts
import { gridStep, isGridKey } from "../../lib/grid";
import { openNode, selectNode } from "../actions/open";
import { focusTarget } from "../focus";
import { state } from "../state";

/**
 * Board of index cards (focused, no Ctrl/Alt): arrows move the selection across the grid,
 * Enter opens the selected card, Esc goes back to the tree, the menu key (or Shift F10)
 * opens the selected card's menu. Keys typed into a synopsis belong to the field.
 */
export function boardKey(e: KeyboardEvent, ids: string[], cols: number, openMenu: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const i = state.areaSel ? ids.indexOf(state.areaSel) : -1;
  let handled = true;

  if (isGridKey(e.key)) {
    const to = gridStep(i, ids.length, cols, e.key);
    if (to >= 0) selectNode(ids[to]);
  } else if (e.key === "Enter") {
    if (i >= 0) void openNode(ids[i]);
  } else if (e.key === "Escape") focusTarget("tree");
  else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) openMenu();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun run test src/lib/grid.test.ts src/store/keys/board.test.ts && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grid.ts src/lib/grid.test.ts src/store/keys/board.ts src/store/keys/board.test.ts
git commit -m "feat(board): keyboard navigation across the grid of cards"
```

---

### Task 7: Card drag and the board's "+ Novo" menu

**Files:**
- Create: `src/components/corkboard/cardDrag.ts`, test `src/components/corkboard/cardDrag.test.ts`
- Create: `src/components/corkboard/boardMenu.ts`, test `src/components/corkboard/boardMenu.test.ts`

**Interfaces:**
- Consumes: `dropTarget` (`lib/tree.ts`); `moveNode(dragId, targetId, pos)` and `createNode(kind, at)` (`store/actions/workspace.ts`); `inManuscript` (`lib/manuscript.ts`); `MenuItem` (`components/ui/ContextMenu.tsx`); `newBook` (Task 4).
- Produces: `cardDrag(): CardDrag | null` (signal, `{ dragId, targetId, pos }`); `cardDropPos(offsetX: number, width: number): "before" | "after"`; `pointerDownOnCard(e: PointerEvent, id: string): void`; `consumeCardClick(): boolean`; `boardNewMenu(folder: AreaNode): MenuItem[]`.

- [ ] **Step 1: Write the failing tests**

`src/components/corkboard/cardDrag.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dropTarget } from "../../lib/tree";
import { cancelNodeRename, createNode, moveNode } from "../../store/actions/workspace";
import { state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { cardDropPos } from "./cardDrag";

describe("card drag", () => {
  it("the left half of a card drops before it, the right half after", () => {
    expect(cardDropPos(10, 220)).toBe("before");
    expect(cardDropPos(109, 220)).toBe("before");
    expect(cardDropPos(110, 220)).toBe("after");
    expect(cardDropPos(0, 0)).toBe("before");
  });

  it("dropping a card after a sibling reorders inside the same folder", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const folder = state.area[1].id;
    for (const i of [0, 1, 2]) {
      await createNode("text", { parent: folder, index: i });
      cancelNodeRename();
    }
    const [a, b, c] = state.area[1].children!.map((n) => n.id);
    // Same parent, index counted after taking the card out (what workspace_move expects).
    expect(dropTarget(state.area, a, c, "after")).toEqual({ parent: folder, index: 2 });
    await moveNode(a, c, "after");
    expect(state.area[1].children!.map((n) => n.id)).toEqual([b, c, a]);
    await moveNode(a, b, "before");
    expect(state.area[1].children!.map((n) => n.id)).toEqual([a, b, c]);
    // A card dropped on itself goes nowhere.
    expect(dropTarget(state.area, a, a, "after")).toBeNull();
  });
});
```

`src/components/corkboard/boardMenu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cancelNodeRename, createNode } from "../../store/actions/workspace";
import { state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { boardNewMenu } from "./boardMenu";

describe("boardNewMenu", () => {
  it("offers Capítulo/Pasta in the Manuscrito and Texto/Pasta outside", async () => {
    await newBook();
    expect(boardNewMenu(state.area[0]).map((i) => i.label)).toEqual(["Capítulo", "Pasta"]);
    await createNode("folder");
    cancelNodeRename();
    expect(boardNewMenu(state.area[1]).map((i) => i.label)).toEqual(["Texto", "Pasta"]);
  });

  it("creates at the end of the board's folder", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const folder = state.area[1];
    boardNewMenu(folder)[0].act();
    await vi.waitFor(() => expect(state.area[1].children?.length).toBe(1));
    expect(state.area[1].children![0].kind).toBe("text");
  });
});
```

(Add `vi` to the vitest import of `boardMenu.test.ts`: `import { describe, expect, it, vi } from "vitest";`.)

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test src/components/corkboard`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/components/corkboard/cardDrag.ts`:

```ts
import { createSignal } from "solid-js";
import { dropTarget } from "../../lib/tree";
import { moveNode } from "../../store/actions/workspace";
import { state } from "../../store/state";

/**
 * Reordering index cards with pointer events (HTML5 drag and drop never reaches the webview
 * on Windows, see `workspace/dragMove.ts`). A card lands only before or after a sibling;
 * moving to another folder stays a tree gesture.
 */

/** Movement (px) before a press on a card becomes a drag; below it, it stays a click. */
const DRAG_START = 4;

export interface CardDrag {
  dragId: string;
  /** Card under the pointer, only when dropping there is allowed. */
  targetId: string | null;
  pos: "before" | "after" | null;
}

const [cardDrag, setCardDrag] = createSignal<CardDrag | null>(null);
export { cardDrag };

/** Where on a card the pointer is: the left half drops before it, the right half after. */
export function cardDropPos(offsetX: number, width: number): "before" | "after" {
  return width > 0 && offsetX / width >= 0.5 ? "after" : "before";
}

let swallowClick = false;

/** True once right after a drag ends: the click the browser fires then is not a real click. */
export function consumeCardClick(): boolean {
  const was = swallowClick;
  swallowClick = false;
  return was;
}

/** Starts tracking a press on card `id`; it becomes a drag only after the pointer moves. */
export function pointerDownOnCard(e: PointerEvent, id: string) {
  swallowClick = false;
  if (e.button !== 0) return;
  const card = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;

  const move = (ev: PointerEvent) => {
    if (!active) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START) return;
      active = true;
      try {
        card.setPointerCapture(ev.pointerId);
      } catch {
        // the pointer may already be gone; window listeners still track it
      }
    }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-card-id]");
    const targetId = hit?.dataset.cardId ?? null;
    if (!hit || !targetId) return setCardDrag({ dragId: id, targetId: null, pos: null });
    const r = hit.getBoundingClientRect();
    const pos = cardDropPos(ev.clientX - r.left, r.width);
    const ok = dropTarget(state.area, id, targetId, pos) !== null;
    setCardDrag({ dragId: id, targetId: ok ? targetId : null, pos: ok ? pos : null });
  };

  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    if (active) swallowClick = true;
  };

  const up = () => {
    const d = cardDrag();
    end();
    setCardDrag(null);
    if (active && d?.targetId && d.pos) void moveNode(d.dragId, d.targetId, d.pos);
  };

  const cancel = () => {
    end();
    setCardDrag(null);
  };

  const key = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !active) return;
    // Capture phase on window: runs before the board and the global shortcuts.
    ev.preventDefault();
    ev.stopPropagation();
    cancel();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
}
```

`src/components/corkboard/boardMenu.ts`:

```ts
import type { AreaNode } from "../../api/types";
import { inManuscript } from "../../lib/manuscript";
import { createNode } from "../../store/actions/workspace";
import { state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

/** "+ Novo" on a board: what the tree allows inside `folder`, created at the end of its cards. */
export function boardNewMenu(folder: AreaNode): MenuItem[] {
  const at = { parent: folder.id, index: folder.children?.length ?? 0 };
  const newFolder: MenuItem = { label: "Pasta", act: () => void createNode("folder", at) };
  return inManuscript(state.area, folder.id)
    ? [{ label: "Capítulo", act: () => void createNode("chapter", at) }, newFolder]
    : [{ label: "Texto", act: () => void createNode("text", at) }, newFolder];
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun run test src/components/corkboard && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/corkboard/cardDrag.ts src/components/corkboard/cardDrag.test.ts src/components/corkboard/boardMenu.ts src/components/corkboard/boardMenu.test.ts
git commit -m "feat(board): card drag to reorder and the board's new-item menu"
```

---

### Task 8: The Corkboard and IndexCard components

**Files:**
- Create: `src/components/workspace/MissingIcon.tsx` (extracted from `TreeRow.tsx`)
- Modify: `src/components/workspace/TreeRow.tsx` (use `MissingIcon`)
- Create: `src/components/corkboard/IndexCard.tsx`
- Create: `src/components/corkboard/Corkboard.tsx`
- Modify: `src/components/workspace/NodeView.tsx` (board match)
- Modify: `src/components/workspace/EmptyArea.tsx` (doc comment only)
- Create: `src/styles/corkboard.css`; Modify: `src/styles/global.css:5` (import it)

**Interfaces:**
- Consumes: `scheduleSynopsis`, `flushSynopsis` (Task 4); `"board"` focus target, `openNode`, `selectNode` (Task 5); `boardKey` (Task 6); `cardDrag`, `pointerDownOnCard`, `consumeCardClick`, `boardNewMenu` (Task 7); `treeMenu`, `selectForMenu` (`workspace/treeMenu.ts`); `ContextMenu`; `displayTitle`; `SYNOPSIS_MAX`; `bookAsset`; `fmt`, `plural`.
- Produces: `<Corkboard folder={AreaNode} />`, `<IndexCard node={AreaNode} onMenu={(x, y) => void} />`, `cardId(id: string): string`, `<MissingIcon />`.

No component rendering tests exist in this project; this task is verified by the typecheck, the full test suite and the app.

- [ ] **Step 1: Extract `MissingIcon`** — `src/components/workspace/MissingIcon.tsx`:

```tsx
/** Warning that a node's file is gone from disk (Rust flags the node `missing`). */
export function MissingIcon() {
  return (
    <svg class="ws-warn" viewBox="0 0 14 14" role="img" aria-label="Arquivo não encontrado">
      <title>Arquivo não encontrado</title>
      <path d="M7 1.8l5.5 9.7h-11z" />
      <path d="M7 5.6v2.6M7 9.9v.1" />
    </svg>
  );
}
```

In `TreeRow.tsx`, import it and replace the inline `<svg class="ws-warn" …>…</svg>` inside `<Show when={node().missing}>` with `<MissingIcon />` (keep the comment above it).

- [ ] **Step 2: `IndexCard.tsx`**

```tsx
import { createSignal, Show } from "solid-js";
import type { AreaNode } from "../../api/types";
import { bookAsset } from "../../lib/assets";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { fmt, plural } from "../../lib/format";
import { displayTitle } from "../../lib/manuscript";
import { openNode, selectNode } from "../../store/actions/open";
import { flushSynopsis, scheduleSynopsis } from "../../store/actions/synopsis";
import { focusTarget } from "../../store/focus";
import { state } from "../../store/state";
import { StatusDot } from "../ui/StatusDot";
import { MissingIcon } from "../workspace/MissingIcon";
import { NodeIcon } from "../workspace/NodeIcon";
import { cardDrag, consumeCardClick, pointerDownOnCard } from "./cardDrag";

/** DOM id of a card, for `aria-activedescendant`. */
export const cardId = (id: string) => "card-" + id;

const stop = (e: Event) => e.stopPropagation();

/** The synopsis, edited in place; an image without one shows its thumbnail until clicked. */
function Synopsis(props: { node: AreaNode }) {
  let field: HTMLTextAreaElement | undefined;
  const [editing, setEditing] = createSignal(false);
  const thumb = () => {
    const n = props.node;
    if (n.kind !== "image" || n.synopsis || editing() || !state.book || !n.file) return null;
    return bookAsset(state.book.dir, "area/" + n.file, 0);
  };
  const onKey = (e: KeyboardEvent) => {
    // The board, the tree and the global shortcuts must not see keys typed into the synopsis.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      focusTarget("board");
    }
  };
  return (
    <Show
      when={thumb()}
      fallback={
        <textarea
          ref={field}
          class="card-syn"
          aria-label="Sinopse"
          value={props.node.synopsis ?? ""}
          maxlength={SYNOPSIS_MAX}
          placeholder="Escreva uma sinopse…"
          onInput={(e) => scheduleSynopsis(props.node.id, e.currentTarget.value)}
          onFocus={() => selectNode(props.node.id)}
          onBlur={() => {
            setEditing(false);
            void flushSynopsis();
          }}
          onKeyDown={onKey}
          // Pressing inside the text edits it: no card drag, click or open.
          onPointerDown={stop}
          onClick={stop}
          onDblClick={stop}
        />
      }
    >
      {(url) => (
        <button
          type="button"
          class="card-thumb"
          aria-label="Escrever uma sinopse"
          onClick={(e) => {
            e.stopPropagation();
            if (consumeCardClick()) return;
            setEditing(true);
            queueMicrotask(() => field?.focus());
          }}
        >
          <img src={url()} alt="" />
        </button>
      )}
    </Show>
  );
}

/** One child of the board's folder: icon, title, synopsis and a footer by kind. */
export function IndexCard(props: { node: AreaNode; onMenu: (x: number, y: number) => void }) {
  const node = () => props.node;
  const id = () => node().id;
  const dropHere = () => {
    const d = cardDrag();
    return d && d.targetId === id() ? d.pos : null;
  };
  return (
    <div
      id={cardId(id())}
      role="option"
      class="card"
      classList={{
        sel: state.areaSel === id(),
        dragging: cardDrag()?.dragId === id(),
        "drop-before": dropHere() === "before",
        "drop-after": dropHere() === "after",
      }}
      aria-selected={state.areaSel === id()}
      data-card-id={id()}
      onPointerDown={(e) => pointerDownOnCard(e, id())}
      onClick={() => {
        if (consumeCardClick()) return;
        selectNode(id());
        focusTarget("board");
      }}
      onDblClick={() => void openNode(id())}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onMenu(e.clientX, e.clientY);
      }}
    >
      <div class="card-head">
        <NodeIcon kind={node().kind} />
        <span class="card-t">{displayTitle(state.area, node())}</span>
        <Show when={node().missing}>
          <MissingIcon />
        </Show>
      </div>
      <Synopsis node={node()} />
      <div class="card-foot ui">
        <Show when={node().kind === "chapter"}>
          <StatusDot status={node().status ?? "rascunho"} />
          <span>{fmt(node().words ?? 0)} palavras</span>
        </Show>
        <Show when={node().kind === "folder"}>
          <span>{plural(node().children?.length ?? 0, "item", "itens")}</span>
        </Show>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `Corkboard.tsx`**

```tsx
import { createEffect, createSignal, For, Show } from "solid-js";
import type { AreaNode } from "../../api/types";
import { displayTitle } from "../../lib/manuscript";
import { focusRef, focusTarget } from "../../store/focus";
import { boardKey } from "../../store/keys/board";
import { state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { Hint } from "../ui/Hint";
import { selectForMenu, treeMenu } from "../workspace/treeMenu";
import { boardNewMenu } from "./boardMenu";
import { cardId, IndexCard } from "./IndexCard";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** Columns the grid laid out, as the browser computed them (1 when it cannot tell). */
function gridColumns(el: HTMLElement | undefined): number {
  if (!el) return 1;
  return getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}

/** A folder or the Manuscrito as index cards, one per child, in tree order. */
export function Corkboard(props: { folder: AreaNode }) {
  let grid: HTMLDivElement | undefined;
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const children = () => props.folder.children ?? [];
  const ids = () => children().map((c) => c.id);
  const selected = () => (state.areaSel && ids().includes(state.areaSel) ? state.areaSel : null);
  const title = () => displayTitle(state.area, props.folder);

  const openCardMenu = (node: AreaNode, x: number, y: number) => {
    selectForMenu(node);
    setMenu({ x, y, items: treeMenu(node) });
  };

  /** Keyboard access: the menu of the selected card, over it. */
  const openMenuAtSelection = () => {
    const node = children().find((c) => c.id === selected());
    if (!node) return;
    const r = document.getElementById(cardId(node.id))?.getBoundingClientRect();
    openCardMenu(node, r ? r.left + 24 : 24, r ? r.top + 32 : 96);
  };

  const openNewMenu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom, items: boardNewMenu(props.folder) });
  };

  const closeMenu = () => {
    setMenu(null);
    focusTarget("board");
  };

  createEffect(() => {
    const id = selected();
    if (id) document.getElementById(cardId(id))?.scrollIntoView({ block: "nearest" });
  });

  return (
    <div class="board">
      <div class="board-head">
        <h2 class="board-title">{title()}</h2>
        <button type="button" class="sp-btn" aria-haspopup="menu" onClick={openNewMenu}>
          + Novo
        </button>
      </div>
      <Show when={children().length > 0} fallback={<p class="board-empty ui">Pasta vazia</p>}>
        <div
          ref={(el) => {
            grid = el;
            focusRef("board")(el);
          }}
          class="board-grid"
          role="listbox"
          aria-label={"Cartões de " + title()}
          tabIndex={0}
          aria-activedescendant={selected() ? cardId(selected()!) : undefined}
          onKeyDown={(e) => boardKey(e, ids(), gridColumns(grid), openMenuAtSelection)}
        >
          <For each={children()}>{(c) => <IndexCard node={c} onMenu={(x, y) => openCardMenu(c, x, y)} />}</For>
        </div>
        <div class="ws-help">
          <Hint keys="←↑↓→">escolher</Hint>
          <Hint keys="Enter">abrir</Hint>
          <Hint keys="Esc">voltar à árvore</Hint>
        </div>
      </Show>
      <Show when={menu()}>{(m) => <ContextMenu x={m().x} y={m().y} items={m().items} onClose={closeMenu} />}</Show>
    </div>
  );
}
```

- [ ] **Step 4: Wire `NodeView.tsx`**

Import `import { isContainer } from "../../lib/tree";` and `import { Corkboard } from "../corkboard/Corkboard";`. In `NodeView`, add

```ts
  const board = () => {
    const n = openAreaNode();
    return n && isContainer(n.kind) ? n : null;
  };
```

and, as the first `Match` inside the `Switch`:

```tsx
      <Match when={board()}>{(n) => <Corkboard folder={n()} />}</Match>
```

Update the `NodeView` doc comment to "Right pane of the workspace: the open node (a folder shows its board), or the empty state." and the `EmptyArea` doc comment to "Shown when nothing is open: the ways to start filling the tree."

- [ ] **Step 5: CSS** — `src/styles/corkboard.css`:

```css
/* Corkboard: a folder's children as index cards. */
@layer components {
  .board {
    display: flex;
    flex-direction: column;
    gap: 20px;
    width: 100%;
    max-width: 1100px;
    height: 100%;
    min-height: 0;
    padding: 64px 36px 24px;
    box-sizing: border-box;
  }
  .board-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }
  .board-title {
    margin: 0;
    font-size: 32px;
    font-weight: 500;
  }
  .board-empty {
    color: var(--muted);
  }
  .board-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
    align-content: start;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 12px;
    outline: none;
    scrollbar-width: thin;
  }
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    aspect-ratio: 5 / 3;
    padding: 12px 14px;
    box-sizing: border-box;
    background: var(--panel);
    border: 1px solid var(--faint);
    border-radius: 6px;
    user-select: none;
  }
  .card.sel {
    border-color: var(--accent);
  }
  .board-grid:focus-visible .card.sel {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .card.dragging {
    opacity: 0.5;
  }
  .card.drop-before::before,
  .card.drop-after::after {
    content: "";
    position: absolute;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .card.drop-before::before {
    left: -10px;
  }
  .card.drop-after::after {
    right: -10px;
  }
  .card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .card-t {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
  }
  .card-syn {
    flex: 1;
    min-height: 0;
    padding: 0;
    border: 0;
    outline: 0;
    resize: none;
    background: transparent;
    color: var(--ink);
    font: inherit;
    font-size: 14px;
    line-height: 1.45;
  }
  .card-syn::placeholder {
    color: var(--muted);
    opacity: 0.75;
  }
  .card-thumb {
    flex: 1;
    min-height: 0;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: text;
  }
  .card-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 3px;
  }
  .card-foot {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 12px;
  }
  /* Motion only for those who did not ask to reduce it. */
  @media (prefers-reduced-motion: no-preference) {
    .card {
      transition: border-color 0.15s ease, opacity 0.15s ease;
    }
  }
}
```

In `src/styles/global.css`, after the last `@import "@fontsource/…";` line add `@import "./corkboard.css";`.

- [ ] **Step 6: Verify**

Run: `./node_modules/.bin/tsc --noEmit -p . && bun run test && bun run build`
Expected: no type errors, all tests PASS, build succeeds.

Then `bun run dev` (http://localhost:1420), open a sample book and check by hand: clicking the Manuscrito shows chapter cards ("Capítulo N" for untitled ones, status dot, words); typing a synopsis shows in the tree's data after reopening the book; Esc in a synopsis returns to the board, Esc on the board returns to the tree; arrows move the selection; Enter/double click opens; dragging a card between two others reorders them; right click shows the tree menu; "+ Novo" creates at the end; an empty folder shows "Pasta vazia"; `Ctrl .` does nothing on a board.

- [ ] **Step 7: Commit**

```bash
git add src/components/workspace/MissingIcon.tsx src/components/workspace/TreeRow.tsx src/components/corkboard/IndexCard.tsx src/components/corkboard/Corkboard.tsx src/components/workspace/NodeView.tsx src/components/workspace/EmptyArea.tsx src/styles/corkboard.css src/styles/global.css
git commit -m "feat(board): corkboard of index cards for folders and the Manuscrito"
```

---

### Task 9: Sinopse in the notes drawer

**Files:**
- Modify: `src/components/panels/NotesPanel.tsx`
- Modify: `src/styles/global.css` (`.syn-ta`, next to `.notes-ta`)

**Interfaces:**
- Consumes: `scheduleSynopsis`, `flushSynopsis` (Task 4); `SYNOPSIS_MAX` (Task 3).
- Produces: a "Sinopse" field above the notes for chapters and texts, the same data as the card.

- [ ] **Step 1: Implement**

In `NotesPanel.tsx`, import `import { SYNOPSIS_MAX } from "../../lib/constants";` and `import { flushSynopsis, scheduleSynopsis } from "../../store/actions/synopsis";`. Change the cleanup to

```ts
  // Closing the drawer unmounts the fields before a `change` event: land pending text here.
  onCleanup(() => {
    void flushNodeNotes();
    void flushSynopsis();
  });
```

Insert right after `<div class="ui cap">Notas · {label()}</div>`:

```tsx
        <label class="ui cap" for="ch-synopsis">
          Sinopse
        </label>
        <textarea
          id="ch-synopsis"
          class="notes-ta syn-ta"
          value={node()?.synopsis ?? ""}
          maxlength={SYNOPSIS_MAX}
          // Same field as the index card: saved debounced, landed on blur and on close.
          onInput={(e) => {
            const n = node();
            if (n) scheduleSynopsis(n.id, e.currentTarget.value);
          }}
          onBlur={() => void flushSynopsis()}
          placeholder="Escreva uma sinopse…"
        />
```

In `src/styles/global.css`, after the `.notes-ta { … }` rule add:

```css
  .syn-ta {
    flex: none;
    height: 96px;
  }
```

(If `.notes-ta` sets `flex-grow`/`height`, keep `.syn-ta` after it so it wins; the notes field keeps the rest of the drawer.)

- [ ] **Step 2: Verify**

Run: `./node_modules/.bin/tsc --noEmit -p . && bun run test && bun run build`
Expected: PASS. In `bun run dev`: open a chapter, `Ctrl ;`, type a synopsis, `Esc`, open the Manuscrito board: the chapter's card shows the same synopsis; editing it on the card shows up in the drawer.

- [ ] **Step 3: Commit**

```bash
git add src/components/panels/NotesPanel.tsx src/styles/global.css
git commit -m "feat(notes): synopsis field in the notes drawer"
```
