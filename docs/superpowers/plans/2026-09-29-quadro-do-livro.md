# Quadro do livro (tab Editor | Quadro) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-folder corkboard with one free board per book (cards with title + text, each text in its own file), shown in an **Editor | Quadro** tab, filled from Scrivener synopses on import.

**Architecture:** Rust owns `quadro/quadro.json` (order + titles) and `quadro/<id>.md` (plain text) through `model/board.rs` (pure list rules), `storage/board_io.rs` (disk), `ops/board.rs` (operations) and `commands/board.rs`. The active tab (per book) and card size live in the Rust prefs. The webview keeps the card list, the texts of cards it has shown, the selected card and pending edits (`store/actions/board.ts`, `boardText.ts`); `components/board/` renders it.

**Tech Stack:** Rust (Tauri 2, serde, tempfile), SolidJS, Tailwind v4 + plain CSS layers, vitest (jsdom, mock API, `solid-js/web` `render` for the few DOM tests), bun.

**Spec:** `docs/superpowers/specs/2026-09-29-quadro-do-livro-design.md`

## Global Constraints

- Comments in English; UI text in Portuguese. No god files; one Rust `mod` per subject. Data/processing in Rust (`CLAUDE.md`).
- Every task ends with a commit; messages have **no** `Co-Authored-By` or any attribution. Stage explicit paths.
- Files: `quadro/quadro.json` = `{ "version": 1, "cards": [{ "id", "title" }] }` (unknown fields survive); `quadro/<id>.md` = plain UTF-8 text, missing = "".
- Limits: title **200** chars, text **20 000** chars, cut by `char` in Rust (by code point in TS).
- Book without `quadro/` = empty board; the folder is created on the first write.
- Duplicate title suffix: `" (cópia)"`. Error for unknown card: `"Cartão não encontrado"`.
- Prefs: `boardTab: string[]` (books whose active tab is Quadro), `cardSize: 0 | 1 | 2` (P/M/G, default 1).
- UI strings verbatim: "Editor", "Quadro", "+ Novo cartão", "Novo cartão", "Novo cartão depois", "Duplicar", "Excluir", "Nenhum cartão ainda.", "Excluir “Título”?", "O cartão e o texto dele serão excluídos.", "Título do cartão", "Anote aqui…", "Tamanho", "P", "M", "G".
- Card sizes ≈ 220×132, 300×180, 380×228 px. Text contrast ≥ 4.5:1 both themes. `prefers-reduced-motion`: no transitions.
- Keys typed in a card field belong to the field **except Ctrl/Cmd chords**, which reach the global shortcuts.
- Kept from the previous feature: `Node.synopsis`, `workspace_set_synopsis`, `store/actions/synopsis.ts`, NotesPanel "Sinopse", `lib/grid.ts`, `MissingIcon`, the tree chevron fix.
- No new dependencies. Commands: `cargo test --manifest-path src-tauri/Cargo.toml`; `bun run test`; `./node_modules/.bin/tsc --noEmit -p .`; `bun run build`.

## Review Focus

1. **A card's text or title typed, then a book switch or window close before the debounce:** lands in the book it was typed in. Covered by `flushAll lands a pending card edit in its own book` (Task 7).
2. **Deleting a card while its text is pending:** no write recreates the deleted `.md`. Covered by `deleting a card drops its pending edit` (Task 7) and `delete_removes_json_entry_then_file` (Task 3).
3. **`quadro.json` edited by a newer app (unknown fields):** they survive a rename. Covered by `unknown_fields_survive` (Task 2).
4. **Multi-byte text over the limits:** cut by character, no panic. Covered by `limits_cut_by_character` (Task 3).
5. **Ctrl K / Ctrl O typed while a card field has focus:** reach the global shortcuts; plain keys do not reach the board. Covered by `card field keys` tests (Task 8).

---

### Task 1: Remove the per-folder board

**Files:**
- Revert (no commit): `aa64a17`, `60401f5`, `d07b5f3`, `c440fa9`, `9ba1240`
- Keep from HEAD: `src/components/workspace/TreeRow.tsx`, `src/components/workspace/TreeRow.test.tsx`, `src/components/workspace/MissingIcon.tsx`, `src/lib/grid.ts`, `src/lib/grid.test.ts`
- Test: `src/store/actions/folderClick.test.ts` (create)

**Interfaces:**
- Produces: `openNode(folderId)` toggles expansion only (as before the board); `initialNode` skips containers; no `components/corkboard/`, no `store/keys/board.ts`, no `"board"` focus target (Task 8 adds it back).

- [ ] **Step 1: Revert and keep what stays**

```bash
git revert --no-commit aa64a17 60401f5 d07b5f3 c440fa9 9ba1240
git checkout HEAD -- src/components/workspace/TreeRow.tsx src/components/workspace/TreeRow.test.tsx src/components/workspace/MissingIcon.tsx src/lib/grid.ts src/lib/grid.test.ts
git status --short
```

Resolve conflicts, if any, in favour of the pre-board code (the revert side). Expected afterwards: `src/components/corkboard/`, `src/styles/corkboard.css`, `src/store/keys/board.ts`, `src/store/actions/board.test.ts` gone; `NodeView.tsx`, `open.ts`, `ui.ts`, `focus.ts`, `open.test.ts`, `global.css`, `EmptyArea.tsx` back to their pre-board text; `TreeRow.tsx` still uses `MissingIcon` and the chevron handler.

- [ ] **Step 2: Write the test** — `src/store/actions/folderClick.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { state } from "../state";
import { newBook } from "../../test/newBook";
import { openNode } from "./open";
import { cancelNodeRename, createNode } from "./workspace";

describe("opening a folder", () => {
  it("only folds or unfolds it: nothing opens in the main pane", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const id = state.area[1].id;
    await openNode(id, false);
    expect(state.areaOpen).toBeNull();
    expect(state.areaExpanded).toContain(id);
    await openNode(id, false);
    expect(state.areaExpanded).not.toContain(id);
  });
});
```

- [ ] **Step 3: Run everything**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p . && bun run build`
Expected: all PASS (the new test passes because the revert restored the toggle; it pins the behaviour).

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "revert(board): drop the per-folder corkboard, keep synopsis, grid and chevron fix"
```

---

### Task 2: Board model and disk I/O (Rust)

**Files:**
- Create: `src-tauri/src/model/board.rs`; Modify: `src-tauri/src/model/mod.rs` (`pub mod board;`)
- Create: `src-tauri/src/storage/board_io.rs`; Modify: `src-tauri/src/storage/mod.rs` (`pub mod board_io;`), `src-tauri/src/storage/paths.rs` (constants)

**Interfaces:**
- Produces:
  - `model::board`: `BOARD_VERSION: u32 = 1`, `TITLE_MAX = 200`, `TEXT_MAX = 20_000`, `struct Board { version, cards: Vec<Card>, extra }` (Default = v1 empty), `struct Card { id: String, title: String, extra }`, `fn cut(s: &str, max: usize) -> String`, `impl Board { fn position(&self, id) -> Option<usize>; fn insert(&mut self, index: usize, card: Card); fn remove(&mut self, id) -> Option<Card>; fn move_to(&mut self, id, index) -> bool }`.
  - `storage::paths`: `BOARD_DIR = "quadro"`, `BOARD_FILE = "quadro.json"`.
  - `storage::board_io`: `read_board(book_dir) -> AppResult<Board>`, `write_board(book_dir, &Board) -> AppResult<()>`, `read_card_text(book_dir, id) -> AppResult<String>`, `write_card_text(book_dir, id, text) -> AppResult<()>`, `remove_card_text(book_dir, id) -> AppResult<()>`.

- [ ] **Step 1: Write the failing tests**

`src-tauri/src/model/board.rs` (tests module at the bottom of the file you create in Step 3; write the file with only the tests and `use super::*;` first so it fails to compile):

```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn card(id: &str) -> Card {
        Card { id: id.into(), title: id.to_uppercase(), extra: Map::new() }
    }
    fn ids(b: &Board) -> Vec<&str> {
        b.cards.iter().map(|c| c.id.as_str()).collect()
    }

    #[test]
    fn unknown_fields_survive() {
        let b: Board = serde_json::from_str(r#"{"version":1,"futuro":1,"cards":[{"id":"a","title":"A","cor":"azul"}]}"#).unwrap();
        let v = serde_json::to_value(&b).unwrap();
        assert_eq!((v["futuro"].clone(), v["cards"][0]["cor"].clone()), (1.into(), "azul".into()));
    }

    #[test]
    fn insert_move_remove_keep_order() {
        let mut b = Board::default();
        b.insert(0, card("a"));
        b.insert(99, card("c"));
        b.insert(1, card("b"));
        assert_eq!(ids(&b), vec!["a", "b", "c"]);
        assert!(b.move_to("a", 2));
        assert_eq!(ids(&b), vec!["b", "c", "a"]);
        assert!(!b.move_to("zz", 0));
        assert_eq!(b.remove("c").unwrap().id, "c");
        assert_eq!((ids(&b), b.position("a")), (vec!["b", "a"], Some(1)));
    }

    #[test]
    fn cut_counts_characters() {
        assert_eq!(cut("éé€x", 3), "éé€");
        assert_eq!(cut("ab", 5), "ab");
    }
}
```

`src-tauri/src/storage/board_io.rs` tests (same approach):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::board::Card;

    #[test]
    fn missing_board_and_text_read_empty_and_writes_create_the_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        assert!(read_board(dir).unwrap().cards.is_empty());
        assert_eq!(read_card_text(dir, "a").unwrap(), "");
        let mut b = Board::default();
        b.insert(0, Card { id: "a".into(), title: "Cap 1".into(), extra: Default::default() });
        write_board(dir, &b).unwrap();
        write_card_text(dir, "a", "Introduz o mundo").unwrap();
        assert_eq!(read_board(dir).unwrap(), b);
        assert_eq!(read_card_text(dir, "a").unwrap(), "Introduz o mundo");
        assert!(dir.join("quadro/a.md").is_file());
        remove_card_text(dir, "a").unwrap();
        remove_card_text(dir, "a").unwrap(); // already gone: fine
        assert!(!dir.join("quadro/a.md").exists());
        assert!(read_card_text(dir, "../x").is_err());
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml board`
Expected: compile errors (types/functions not found).

- [ ] **Step 3: Implement**

`src-tauri/src/storage/paths.rs`, after `AREA_FILES_DIR`:

```rust
pub const BOARD_DIR: &str = "quadro";
pub const BOARD_FILE: &str = "quadro.json";
```

`src-tauri/src/model/board.rs` (above the tests):

```rust
//! The book's board (`quadro/quadro.json`): free index cards in order. Each card's text lives
//! in its own file (`quadro/<id>.md`), handled by `storage::board_io`.
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const BOARD_VERSION: u32 = 1;
/// Longest card title and text, in characters.
pub const TITLE_MAX: usize = 200;
pub const TEXT_MAX: usize = 20_000;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Board {
    pub version: u32,
    #[serde(default)]
    pub cards: Vec<Card>,
    /// Unknown keys survive a read/write cycle.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Board {
    fn default() -> Self {
        Self { version: BOARD_VERSION, cards: Vec::new(), extra: Map::new() }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Card {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

/// `s` cut to `max` characters (never inside one).
pub fn cut(s: &str, max: usize) -> String {
    s.chars().take(max).collect()
}

impl Board {
    pub fn position(&self, id: &str) -> Option<usize> {
        self.cards.iter().position(|c| c.id == id)
    }

    /// Inserts at `index`, clamped to the end.
    pub fn insert(&mut self, index: usize, card: Card) {
        let at = index.min(self.cards.len());
        self.cards.insert(at, card);
    }

    pub fn remove(&mut self, id: &str) -> Option<Card> {
        self.position(id).map(|i| self.cards.remove(i))
    }

    /// Moves `id` to `index` (position after taking it out); false when `id` is unknown.
    pub fn move_to(&mut self, id: &str, index: usize) -> bool {
        match self.remove(id) {
            Some(card) => {
                self.insert(index, card);
                true
            }
            None => false,
        }
    }
}
```

`src-tauri/src/storage/board_io.rs` (above the tests):

```rust
//! Disk I/O for the book's board: `quadro/quadro.json` and one `quadro/<id>.md` per card.
use std::{fs, io::ErrorKind, path::{Path, PathBuf}};

use super::{atomic::write_atomic, paths::{safe_join, BOARD_DIR, BOARD_FILE}};
use crate::error::AppResult;
use crate::model::board::Board;

fn text_path(book_dir: &Path, id: &str) -> AppResult<PathBuf> {
    safe_join(&book_dir.join(BOARD_DIR), &format!("{id}.md"))
}

/// The board; a book without `quadro/` has an empty one.
pub fn read_board(book_dir: &Path) -> AppResult<Board> {
    match fs::read_to_string(book_dir.join(BOARD_DIR).join(BOARD_FILE)) {
        Ok(s) => Ok(serde_json::from_str(&s)?),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Board::default()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_board(book_dir: &Path, board: &Board) -> AppResult<()> {
    let dir = book_dir.join(BOARD_DIR);
    fs::create_dir_all(&dir)?;
    write_atomic(&dir.join(BOARD_FILE), serde_json::to_string_pretty(board)?.as_bytes())?;
    Ok(())
}

/// A card's text; a missing file reads as empty.
pub fn read_card_text(book_dir: &Path, id: &str) -> AppResult<String> {
    match fs::read_to_string(text_path(book_dir, id)?) {
        Ok(s) => Ok(s),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.into()),
    }
}

pub fn write_card_text(book_dir: &Path, id: &str, text: &str) -> AppResult<()> {
    fs::create_dir_all(book_dir.join(BOARD_DIR))?;
    write_atomic(&text_path(book_dir, id)?, text.as_bytes())?;
    Ok(())
}

/// Removes a card's text file; one already gone is fine.
pub fn remove_card_text(book_dir: &Path, id: &str) -> AppResult<()> {
    match fs::remove_file(text_path(book_dir, id)?) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}
```

If `safe_join` does not reject `../x.md`, the last assertion of the I/O test fails: then check how `safe_join` validates and make `text_path` refuse ids that are not `[A-Za-z0-9_-]+` with `AppError::msg("Cartão não encontrado")`.

Add `pub mod board;` to `model/mod.rs` and `pub mod board_io;` to `storage/mod.rs`.

- [ ] **Step 4: Run to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/model/board.rs src-tauri/src/model/mod.rs src-tauri/src/storage/board_io.rs src-tauri/src/storage/mod.rs src-tauri/src/storage/paths.rs
git commit -m "feat(board): book board model and its disk I/O"
```

---

### Task 3: Board operations and commands (Rust)

**Files:**
- Create: `src-tauri/src/ops/board.rs`; Modify: `src-tauri/src/ops/mod.rs`
- Create: `src-tauri/src/commands/board.rs`; Modify: `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: Task 2.
- Produces (`ops::board`): `struct Created { id: String, cards: Vec<Card> }` (camelCase serde); `list(dir) -> AppResult<Vec<Card>>`; `create(dir, index, title) -> AppResult<Created>`; `rename(dir, id, title) -> AppResult<Vec<Card>>`; `load_text(dir, id) -> AppResult<String>`; `save_text(dir, id, text) -> AppResult<()>`; `move_to(dir, id, index) -> AppResult<Vec<Card>>`; `delete(dir, id) -> AppResult<Vec<Card>>`; `duplicate(dir, id) -> AppResult<Created>`; `append(dir, notes: Vec<(String, String)>) -> AppResult<usize>` (title, text; for the import).
- Commands: `board_list`, `board_create{index,title}`, `board_rename{id,title}`, `board_load_text{id}`, `board_save_text{id,text}`, `board_move{id,index}`, `board_delete{id}`, `board_duplicate{id}` — all with `bookId`.

- [ ] **Step 1: Write the failing tests** — in `src-tauri/src/ops/board.rs` (test module only first):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::ops::library::create_book;

    fn book() -> (tempfile::TempDir, std::path::PathBuf) {
        let root = tempfile::tempdir().unwrap();
        let (dir, _meta) = create_book(root.path(), "Obra").unwrap();
        (root, dir)
    }
    fn titles(cards: &[Card]) -> Vec<&str> {
        cards.iter().map(|c| c.title.as_str()).collect()
    }

    #[test]
    fn create_rename_move_and_text() {
        let (_r, dir) = book();
        assert!(list(&dir).unwrap().is_empty());
        let a = create(&dir, 0, "Capítulo 1").unwrap();
        let b = create(&dir, 99, "Capítulo 2").unwrap();
        assert_eq!(titles(&b.cards), vec!["Capítulo 1", "Capítulo 2"]);
        save_text(&dir, &a.id, "O capítulo introduz o mundo venante").unwrap();
        assert_eq!(load_text(&dir, &a.id).unwrap(), "O capítulo introduz o mundo venante");
        assert_eq!(load_text(&dir, &b.id).unwrap(), "");
        assert_eq!(titles(&rename(&dir, &b.id, "Dois").unwrap()), vec!["Capítulo 1", "Dois"]);
        assert_eq!(titles(&move_to(&dir, &a.id, 1).unwrap()), vec!["Dois", "Capítulo 1"]);
        assert_eq!(rename(&dir, "zz", "x").unwrap_err().0, "Cartão não encontrado");
        assert_eq!(save_text(&dir, "zz", "x").unwrap_err().0, "Cartão não encontrado");
    }

    #[test]
    fn delete_removes_json_entry_then_file() {
        let (_r, dir) = book();
        let a = create(&dir, 0, "A").unwrap().id;
        save_text(&dir, &a, "texto").unwrap();
        assert!(delete(&dir, &a).unwrap().is_empty());
        assert!(!dir.join("quadro").join(format!("{a}.md")).exists());
        assert_eq!(delete(&dir, &a).unwrap_err().0, "Cartão não encontrado");
    }

    #[test]
    fn duplicate_copies_text_right_after() {
        let (_r, dir) = book();
        let a = create(&dir, 0, "A").unwrap().id;
        create(&dir, 1, "B").unwrap();
        save_text(&dir, &a, "texto").unwrap();
        let d = duplicate(&dir, &a).unwrap();
        assert_eq!(titles(&d.cards), vec!["A", "A (cópia)", "B"]);
        assert_eq!(load_text(&dir, &d.id).unwrap(), "texto");
    }

    #[test]
    fn limits_cut_by_character() {
        let (_r, dir) = book();
        let a = create(&dir, 0, &"é".repeat(TITLE_MAX + 3)).unwrap();
        assert_eq!(a.cards[0].title.chars().count(), TITLE_MAX);
        save_text(&dir, &a.id, &"€".repeat(TEXT_MAX + 3)).unwrap();
        assert_eq!(load_text(&dir, &a.id).unwrap().chars().count(), TEXT_MAX);
    }

    #[test]
    fn append_adds_cards_at_the_end() {
        let (_r, dir) = book();
        create(&dir, 0, "Antigo").unwrap();
        assert_eq!(append(&dir, vec![("Cap 1".into(), "Resumo".into())]).unwrap(), 1);
        let cards = list(&dir).unwrap();
        assert_eq!(titles(&cards), vec!["Antigo", "Cap 1"]);
        assert_eq!(load_text(&dir, &cards[1].id).unwrap(), "Resumo");
        assert_eq!(append(&dir, vec![]).unwrap(), 0);
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml ops::board`
Expected: compile errors.

- [ ] **Step 3: Implement** — `src-tauri/src/ops/board.rs` (above the tests):

```rust
//! Operations on the book's board: cards with a title (in `quadro.json`) and a text file each.
use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::ids::new_id;
use crate::model::board::{cut, Board, Card, TEXT_MAX, TITLE_MAX};
use crate::storage::board_io::{read_board, read_card_text, remove_card_text, write_board, write_card_text};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Created {
    pub id: String,
    pub cards: Vec<Card>,
}

fn not_found() -> AppError {
    AppError::msg("Cartão não encontrado")
}

fn new_card(title: &str) -> Card {
    Card { id: new_id(), title: cut(title, TITLE_MAX), extra: Default::default() }
}

/// Loads the board, applies `f`, saves it and returns the cards.
fn edit(dir: &Path, f: impl FnOnce(&mut Board) -> AppResult<()>) -> AppResult<Vec<Card>> {
    let mut board = read_board(dir)?;
    f(&mut board)?;
    write_board(dir, &board)?;
    Ok(board.cards)
}

fn known(dir: &Path, id: &str) -> AppResult<()> {
    read_board(dir)?.position(id).map(|_| ()).ok_or_else(not_found)
}

pub fn list(dir: &Path) -> AppResult<Vec<Card>> {
    Ok(read_board(dir)?.cards)
}

/// New empty card at `index` (clamped to the end).
pub fn create(dir: &Path, index: usize, title: &str) -> AppResult<Created> {
    let card = new_card(title);
    let id = card.id.clone();
    let cards = edit(dir, |b| {
        b.insert(index, card);
        Ok(())
    })?;
    Ok(Created { id, cards })
}

pub fn rename(dir: &Path, id: &str, title: &str) -> AppResult<Vec<Card>> {
    edit(dir, |b| {
        let i = b.position(id).ok_or_else(not_found)?;
        b.cards[i].title = cut(title, TITLE_MAX);
        Ok(())
    })
}

pub fn load_text(dir: &Path, id: &str) -> AppResult<String> {
    known(dir, id)?;
    read_card_text(dir, id)
}

pub fn save_text(dir: &Path, id: &str, text: &str) -> AppResult<()> {
    known(dir, id)?;
    write_card_text(dir, id, &cut(text, TEXT_MAX))
}

pub fn move_to(dir: &Path, id: &str, index: usize) -> AppResult<Vec<Card>> {
    edit(dir, |b| if b.move_to(id, index) { Ok(()) } else { Err(not_found()) })
}

/// Removes the card from the board, then its text file (the board is already saved).
pub fn delete(dir: &Path, id: &str) -> AppResult<Vec<Card>> {
    let cards = edit(dir, |b| b.remove(id).map(|_| ()).ok_or_else(not_found))?;
    if let Err(e) = remove_card_text(dir, id) {
        eprintln!("could not remove card text {id}: {e}");
    }
    Ok(cards)
}

/// A copy of the card (title + " (cópia)", same text) right after it.
pub fn duplicate(dir: &Path, id: &str) -> AppResult<Created> {
    let board = read_board(dir)?;
    let i = board.position(id).ok_or_else(not_found)?;
    let copy = new_card(&format!("{} (cópia)", board.cards[i].title));
    write_card_text(dir, &copy.id, &read_card_text(dir, id)?)?;
    let new = copy.id.clone();
    let cards = edit(dir, |b| {
        b.insert(i + 1, copy);
        Ok(())
    })?;
    Ok(Created { id: new, cards })
}

/// Cards (title, text) added at the end, in order; returns how many.
pub fn append(dir: &Path, notes: Vec<(String, String)>) -> AppResult<usize> {
    if notes.is_empty() {
        return Ok(0);
    }
    let count = notes.len();
    let mut cards = Vec::with_capacity(count);
    for (title, text) in notes {
        let card = new_card(&title);
        write_card_text(dir, &card.id, &cut(&text, TEXT_MAX))?;
        cards.push(card);
    }
    edit(dir, |b| {
        b.cards.extend(cards);
        Ok(())
    })?;
    Ok(count)
}
```

`src-tauri/src/commands/board.rs`:

```rust
use tauri::State;

use crate::error::AppResult;
use crate::model::board::Card;
use crate::ops::board as ops;
use crate::state::{lock, SharedLibrary};

#[tauri::command]
pub async fn board_list(state: State<'_, SharedLibrary>, book_id: String) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::list(dir))
}

#[tauri::command]
pub async fn board_create(state: State<'_, SharedLibrary>, book_id: String, index: usize, title: String) -> AppResult<ops::Created> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::create(dir, index, &title))
}

#[tauri::command]
pub async fn board_rename(state: State<'_, SharedLibrary>, book_id: String, id: String, title: String) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::rename(dir, &id, &title))
}

#[tauri::command]
pub async fn board_load_text(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<String> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::load_text(dir, &id))
}

#[tauri::command]
pub async fn board_save_text(state: State<'_, SharedLibrary>, book_id: String, id: String, text: String) -> AppResult<()> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::save_text(dir, &id, &text))
}

#[tauri::command]
pub async fn board_move(state: State<'_, SharedLibrary>, book_id: String, id: String, index: usize) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::move_to(dir, &id, index))
}

#[tauri::command]
pub async fn board_delete(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<Vec<Card>> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::delete(dir, &id))
}

#[tauri::command]
pub async fn board_duplicate(state: State<'_, SharedLibrary>, book_id: String, id: String) -> AppResult<ops::Created> {
    lock(&state)?.with_book(&book_id, |dir, _meta| ops::duplicate(dir, &id))
}
```

Add `pub mod board;` to `ops/mod.rs` and `commands/mod.rs`; in `lib.rs` `invoke_handler`, after the `workspace::…` lines add `board::board_list, board::board_create, board::board_rename, board::board_load_text, board::board_save_text, board::board_move, board::board_delete, board::board_duplicate,` (and `board` to the `commands::{…}` import used there — match how `workspace` is imported).

- [ ] **Step 4: Run to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all PASS; `cargo build` inside tests compiles the commands.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/ops/board.rs src-tauri/src/ops/mod.rs src-tauri/src/commands/board.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(board): board operations and commands"
```

---

### Task 4: Prefs for the tab and card size (Rust)

**Files:**
- Modify: `src-tauri/src/model/prefs.rs`

**Interfaces:**
- Produces: `Prefs.board_tab: Vec<String>` (json `boardTab`, default empty), `Prefs.card_size: u8` (json `cardSize`, default 1, clamped to 2); `PrefsPatch` gets both.

- [ ] **Step 1: Write the failing test** — in `prefs.rs` tests:

```rust
    #[test]
    fn board_tab_and_card_size_default_and_clamp() {
        let p: Prefs = serde_json::from_str(r#"{"theme":"dark","goal":2000,"width":1,"font":1}"#).unwrap();
        assert!(p.board_tab.is_empty());
        assert_eq!(p.card_size, 1);
        let p = p.apply(PrefsPatch { board_tab: Some(vec!["b1".into()]), card_size: Some(7), ..Default::default() });
        assert_eq!((p.board_tab.clone(), p.card_size), (vec!["b1".to_string()], 2));
        let v = serde_json::to_value(&p).unwrap();
        assert_eq!((v["boardTab"][0].clone(), v["cardSize"].clone()), ("b1".into(), 2.into()));
    }
```

- [ ] **Step 2: Run to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml prefs`
Expected: compile error (`no field board_tab`).

- [ ] **Step 3: Implement**

In `Prefs`, after `sidebar_closed`:

```rust
    /// Books whose main pane shows the Quadro tab (Editor is the default).
    #[serde(default)]
    pub board_tab: Vec<String>,
    /// Board card size: 0 small, 1 medium, 2 large.
    #[serde(default = "medium")]
    pub card_size: u8,
```

Add `fn medium() -> u8 { 1 }` above `impl Default for Prefs`; in `Default`, add `board_tab: Vec::new(), card_size: 1`. In `PrefsPatch` add `pub board_tab: Option<Vec<String>>, pub card_size: Option<u8>,`; in `apply` add

```rust
        if let Some(v) = p.board_tab { self.board_tab = v; }
        if let Some(v) = p.card_size { self.card_size = v.min(2); }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/model/prefs.rs
git commit -m "feat(prefs): active tab per book and board card size"
```

---

### Task 5: Scrivener synopses become board cards (Rust)

**Files:**
- Modify: `src-tauri/src/scrivener/import.rs`

**Interfaces:**
- Consumes: `ops::board::append` (Task 3), `Project::synopsis` (existing).
- Produces: `Ctx.cards: Vec<(String, String)>`; `Outcome` unchanged.

- [ ] **Step 1: Write the failing tests** — in `import.rs` tests, add `use crate::ops::board;` to the test imports and:

```rust
    /// Board cards of a book as (title, text).
    fn board_cards(dir: &Path) -> Vec<(String, String)> {
        board::list(dir).unwrap().into_iter().map(|c| {
            let text = board::load_text(dir, &c.id).unwrap();
            (c.title, text)
        }).collect()
    }

    #[test]
    fn synopses_become_board_cards_in_binder_order() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let root = tmp.path().join("Scribalis");
        fs::create_dir_all(&root).unwrap();
        let (dir, _meta, _out) = import_new_book(&root, &p, &folders(&["C1", "C2"])).unwrap();
        let expected = vec![
            ("Capítulo 1".to_string(), "Chegada ao porto".to_string()),
            ("Cena 1".to_string(), "Abertura".to_string()),
            ("Ana".to_string(), "A heroína".to_string()),
        ];
        assert_eq!(board_cards(&dir), expected);
        // The synopsis field keeps its guide role.
        assert_eq!(chapters(&read_workspace(&dir).unwrap().items)[0].synopsis, "Chegada ao porto");
    }

    #[test]
    fn import_into_an_open_book_appends_to_its_board() {
        let tmp = tempfile::tempdir().unwrap();
        let p = project(tmp.path());
        let (dir, mut meta) = create_book(tmp.path(), "Minha").unwrap();
        board::create(&dir, 0, "Meu cartão").unwrap();
        import_into(&p, &folders(&["C1"]), &dir, &mut meta, Some("Livro")).unwrap();
        let titles: Vec<String> = board_cards(&dir).into_iter().map(|c| c.0).collect();
        assert_eq!(titles, vec!["Meu cartão", "Capítulo 1", "Cena 1", "Ana"]);
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `cargo test --manifest-path src-tauri/Cargo.toml scrivener::import`
Expected: FAIL (board empty).

- [ ] **Step 3: Implement**

- `struct Ctx`: add `/// Items with a synopsis, as board cards (title, text), in binder order.\n    cards: Vec<(String, String)>,`; both `Ctx { … }` constructors get `cards: Vec::new()`.
- New method on `impl Ctx<'_>`:

```rust
    /// Queues a board card for `item` when it has a synopsis.
    fn note_card(&mut self, item: &BinderItem) {
        let synopsis = self.project.synopsis(&item.key);
        if !synopsis.is_empty() {
            self.cards.push((title_of(item), synopsis));
        }
    }
```

- In `node()`, right after the trash check and **after** the `chapter_items` branch (a chapter's own card comes from `gather`), add `self.note_card(item);` before the `match item.kind`.
- In `gather()`, right after the trash check, add `self.note_card(item);`.
- In `import_into`, after `write_workspace(dir, &ws)?;` add `crate::ops::board::append(dir, std::mem::take(&mut ctx.cards))?;` (take the cards before `ctx.chapters` is moved, or move this line so `ctx` is still usable — adjust order so it compiles).

- [ ] **Step 4: Run to verify they pass**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/scrivener/import.rs
git commit -m "feat(scrivener): synopses become cards on the book board"
```

---

### Task 6: Front API, types, prefs and mock

**Files:**
- Modify: `src/api/types.ts` (`BoardCard`, `BoardCreated`, `Prefs.boardTab`, `Prefs.cardSize`)
- Modify: `src/lib/constants.ts` (`DEFAULT_PREFS`, `CARD_TITLE_MAX`, `CARD_TEXT_MAX`)
- Create: `src/api/board.ts`
- Create: `src/api/mock/board.ts`; Modify: `src/api/mock/index.ts`, `src/api/mock/db.ts` (`MockBook.board`, `boardText`, `db.prefs`)
- Test: `src/api/mock/board.test.ts`

**Interfaces:**
- Produces: `interface BoardCard { id: string; title: string }`; `interface BoardCreated { id: string; cards: BoardCard[] }`; `CARD_TITLE_MAX = 200`, `CARD_TEXT_MAX = 20000`; `api/board.ts`: `boardList(bookId)`, `boardCreate(bookId, index, title)`, `boardRename(bookId, id, title)`, `boardLoadText(bookId, id)`, `boardSaveText(bookId, id, text)`, `boardMove(bookId, id, index)`, `boardDelete(bookId, id)`, `boardDuplicate(bookId, id)`.

- [ ] **Step 1: Write the failing test** — `src/api/mock/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BoardCard, BoardCreated, BookMeta, BookSummary } from "../types";
import { mockInvoke } from "./index";

async function book() {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Quadro" });
  return (await mockInvoke<BookMeta>("book_open", { id: created.id })).id;
}

describe("board (mock)", () => {
  it("behaves like the Rust board", async () => {
    const bookId = await book();
    expect(await mockInvoke<BoardCard[]>("board_list", { bookId })).toEqual([]);
    const a = await mockInvoke<BoardCreated>("board_create", { bookId, index: 0, title: "A" });
    const b = await mockInvoke<BoardCreated>("board_create", { bookId, index: 9, title: "B" });
    expect(b.cards.map((c) => c.title)).toEqual(["A", "B"]);
    await mockInvoke("board_save_text", { bookId, id: a.id, text: "texto" });
    expect(await mockInvoke("board_load_text", { bookId, id: a.id })).toBe("texto");
    const d = await mockInvoke<BoardCreated>("board_duplicate", { bookId, id: a.id });
    expect(d.cards.map((c) => c.title)).toEqual(["A", "A (cópia)", "B"]);
    expect(await mockInvoke("board_load_text", { bookId, id: d.id })).toBe("texto");
    const moved = await mockInvoke<BoardCard[]>("board_move", { bookId, id: a.id, index: 2 });
    expect(moved.map((c) => c.title)).toEqual(["A (cópia)", "B", "A"]);
    expect((await mockInvoke<BoardCard[]>("board_delete", { bookId, id: b.id })).length).toBe(2);
    await expect(mockInvoke("board_rename", { bookId, id: "zz", title: "x" })).rejects.toBe("Cartão não encontrado");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test src/api/mock/board.test.ts`
Expected: FAIL ("Comando desconhecido: board_list").

- [ ] **Step 3: Implement**

`src/api/types.ts`: after `Created`:

```ts
/** A card of the book's board; its text is loaded apart (`boardLoadText`). */
export interface BoardCard {
  id: string;
  title: string;
}

export interface BoardCreated {
  id: string;
  cards: BoardCard[];
}
```

In `Prefs`, after `sidebarClosed`:

```ts
  /** Books whose main pane shows the Quadro tab. */
  boardTab: string[];
  /** Board card size: 0 P, 1 M, 2 G. */
  cardSize: 0 | 1 | 2;
```

`src/lib/constants.ts`: `DEFAULT_PREFS` gets `boardTab: [], cardSize: 1`; add

```ts
/** Longest card title and text, in characters (Rust cuts at the same length). */
export const CARD_TITLE_MAX = 200;
export const CARD_TEXT_MAX = 20000;
```

`src/api/mock/db.ts`: `db.prefs` gets `boardTab: [], cardSize: 1`; `MockBook` gets

```ts
  /** The book's board (order + titles) and each card's text. */
  board?: BoardCard[];
  boardText?: Record<string, string>;
```

(import `BoardCard` in its type import).

`src/api/board.ts`:

```ts
import { call } from "./invoke";
import type { BoardCard, BoardCreated } from "./types";

// The book's board: free cards, each with a title and a text of its own.

export const boardList = (bookId: string) => call<BoardCard[]>("board_list", { bookId });
export const boardCreate = (bookId: string, index: number, title: string) =>
  call<BoardCreated>("board_create", { bookId, index, title });
export const boardRename = (bookId: string, id: string, title: string) =>
  call<BoardCard[]>("board_rename", { bookId, id, title });
export const boardLoadText = (bookId: string, id: string) => call<string>("board_load_text", { bookId, id });
export const boardSaveText = (bookId: string, id: string, text: string) =>
  call<void>("board_save_text", { bookId, id, text });
/** `index` is the position after taking the card out. */
export const boardMove = (bookId: string, id: string, index: number) =>
  call<BoardCard[]>("board_move", { bookId, id, index });
export const boardDelete = (bookId: string, id: string) => call<BoardCard[]>("board_delete", { bookId, id });
export const boardDuplicate = (bookId: string, id: string) => call<BoardCreated>("board_duplicate", { bookId, id });
```

`src/api/mock/board.ts`:

```ts
import type { BoardCard, BoardCreated } from "../types";
import { CARD_TEXT_MAX, CARD_TITLE_MAX } from "../../lib/constants";
import { findBook, mockId, touch, type MockBook } from "./db";

// Mirrors `ops::board`: same order rules, limits and messages.

const cut = (s: string, max: number) => Array.from(s).slice(0, max).join("");

function cards(b: MockBook): BoardCard[] {
  b.board ??= [];
  b.boardText ??= {};
  return b.board;
}

function at(b: MockBook, id: string): number {
  const i = cards(b).findIndex((c) => c.id === id);
  if (i < 0) throw "Cartão não encontrado";
  return i;
}

type Ids = { bookId: string; id: string };

export const board = {
  board_list: ({ bookId }: { bookId: string }): BoardCard[] => cards(findBook(bookId)),

  board_create: ({ bookId, index, title }: { bookId: string; index: number; title: string }): BoardCreated => {
    const b = findBook(bookId);
    const card = { id: mockId(), title: cut(title, CARD_TITLE_MAX) };
    const list = cards(b);
    list.splice(Math.min(index, list.length), 0, card);
    touch(b);
    return { id: card.id, cards: list };
  },

  board_rename: ({ bookId, id, title }: Ids & { title: string }): BoardCard[] => {
    const b = findBook(bookId);
    cards(b)[at(b, id)].title = cut(title, CARD_TITLE_MAX);
    touch(b);
    return cards(b);
  },

  board_load_text: ({ bookId, id }: Ids): string => {
    const b = findBook(bookId);
    at(b, id);
    return b.boardText![id] ?? "";
  },

  board_save_text: ({ bookId, id, text }: Ids & { text: string }): void => {
    const b = findBook(bookId);
    at(b, id);
    b.boardText![id] = cut(text, CARD_TEXT_MAX);
    touch(b);
  },

  board_move: ({ bookId, id, index }: Ids & { index: number }): BoardCard[] => {
    const b = findBook(bookId);
    const list = cards(b);
    const [card] = list.splice(at(b, id), 1);
    list.splice(Math.min(index, list.length), 0, card);
    touch(b);
    return list;
  },

  board_delete: ({ bookId, id }: Ids): BoardCard[] => {
    const b = findBook(bookId);
    cards(b).splice(at(b, id), 1);
    delete b.boardText![id];
    touch(b);
    return cards(b);
  },

  board_duplicate: ({ bookId, id }: Ids): BoardCreated => {
    const b = findBook(bookId);
    const i = at(b, id);
    const copy = { id: mockId(), title: cut(cards(b)[i].title + " (cópia)", CARD_TITLE_MAX) };
    b.boardText![copy.id] = b.boardText![id] ?? "";
    cards(b).splice(i + 1, 0, copy);
    touch(b);
    return { id: copy.id, cards: cards(b) };
  },
};
```

If `MockBook` is not exported as a type from `db.ts`, export it (it is declared `export interface MockBook`). Register in `src/api/mock/index.ts`: import `{ board } from "./board"` and add `...board` to `handlers`.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test src/api/mock/board.test.ts && ./node_modules/.bin/tsc --noEmit -p .`
Expected: PASS, no type errors (fix any `Prefs` literal the compiler flags by adding `boardTab: [], cardSize: 1`).

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/lib/constants.ts src/api/board.ts src/api/mock/board.ts src/api/mock/board.test.ts src/api/mock/index.ts src/api/mock/db.ts
git commit -m "feat(api): board commands, prefs fields and their mock"
```

---

### Task 7: Board store (list, edits, tab)

**Files:**
- Modify: `src/store/state.ts` (`board`, `boardText`, `boardSel`)
- Create: `src/store/actions/boardText.ts` (pending title/text + flusher)
- Create: `src/store/actions/board.ts` (load, create, move, duplicate, delete, text load)
- Create: `src/store/actions/tabs.ts` (`mainTab`, `setMainTab`)
- Modify: `src/store/actions/library.ts` (reset + load board on `openBook`)
- Modify: `src/store/actions/open.ts` (opening a leaf switches to Editor)
- Modify: `src/store/actions/ui.ts` (focus mode only on Editor)
- Test: `src/store/actions/board.test.ts` (create)

**Interfaces:**
- Consumes: Task 6; `registerFlusher`, `flushAll`; `askConfirm`; `updatePrefs`; `newBook` (`src/test/newBook.ts`).
- Produces:
  - state: `board: BoardCard[]`, `boardText: Record<string, string>`, `boardSel: string | null` (defaults `[]`, `{}`, `null`).
  - `tabs.ts`: `type MainTab = "editor" | "board"`; `mainTab(): MainTab`; `setMainTab(tab: MainTab): void`.
  - `boardText.ts`: `scheduleCardTitle(id, title)`, `scheduleCardText(id, text)`, `flushCard(): Promise<void> | undefined`, `dropCardEdit(id)`.
  - `board.ts`: `loadBoard(bookId)`, `loadCardText(id)`, `createCard(index?: number)`, `moveCard(id, index)`, `duplicateCard(id)`, `deleteCard(id)`, `requestCardDelete(id)`, `selectCard(id | null)`.

- [ ] **Step 1: Write the failing tests** — `src/store/actions/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { BoardCard } from "../../api/types";
import { newBook } from "../../test/newBook";
import { answerConfirm } from "../confirm";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { createCard, deleteCard, duplicateCard, loadBoard, loadCardText, moveCard, requestCardDelete } from "./board";
import { flushCard, scheduleCardText, scheduleCardTitle } from "./boardText";
import { openNode } from "./open";
import { mainTab, setMainTab } from "./tabs";
import { toggleFocusMode } from "./ui";

const saved = (bookId: string, id: string) => mockInvoke<string>("board_load_text", { bookId, id });
const titles = () => state.board.map((c) => c.title);

async function bookWithBoard() {
  const book = await newBook();
  setState({ board: [], boardText: {}, boardSel: null });
  await loadBoard(book.id);
  return book;
}

describe("board store", () => {
  it("creates, moves, duplicates and deletes cards", async () => {
    await bookWithBoard();
    await createCard();
    const a = state.boardSel!;
    await createCard();
    expect(state.board.length).toBe(2);
    expect(state.boardText[a]).toBe("");
    await moveCard(a, 1);
    expect(state.board[1].id).toBe(a);
    await duplicateCard(a);
    expect(state.board.length).toBe(3);
    await deleteCard(a);
    expect(state.board.some((c) => c.id === a)).toBe(false);
  });

  it("asks before deleting", async () => {
    await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    const asked = requestCardDelete(id);
    answerConfirm(false);
    await asked;
    expect(state.board.length).toBe(1);
  });

  it("title and text show at once and save on flush", async () => {
    const book = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    scheduleCardTitle(id, "Capítulo 1");
    scheduleCardText(id, "O capítulo introduz o mundo venante");
    expect(titles()).toEqual(["Capítulo 1"]);
    await flushCard();
    expect(await saved(book.id, id)).toBe("O capítulo introduz o mundo venante");
    const list = await mockInvoke<BoardCard[]>("board_list", { bookId: book.id });
    expect(list[0].title).toBe("Capítulo 1");
  });

  it("flushAll lands a pending card edit in its own book", async () => {
    const first = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    scheduleCardText(id, "nao perder");
    await bookWithBoard();
    await flushAll();
    expect(await saved(first.id, id)).toBe("nao perder");
  });

  it("deleting a card drops its pending edit", async () => {
    const book = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    scheduleCardText(id, "vai sumir");
    await deleteCard(id);
    await flushAll();
    await expect(saved(book.id, id)).rejects.toBe("Cartão não encontrado");
  });

  it("loads a card's text once", async () => {
    const book = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    await mockInvoke("board_save_text", { bookId: book.id, id, text: "do disco" });
    setState("boardText", {});
    await loadCardText(id);
    expect(state.boardText[id]).toBe("do disco");
  });
});

describe("main tab", () => {
  it("is remembered per book and opening a text goes back to the Editor", async () => {
    await bookWithBoard();
    expect(mainTab()).toBe("editor");
    setMainTab("board");
    expect(mainTab()).toBe("board");
    expect(state.prefs.boardTab).toContain(state.book!.id);
    const chapter = state.area[0].children![0].id;
    await openNode(chapter, false);
    expect(mainTab()).toBe("editor");
  });

  it("focus mode does not turn on over the board", async () => {
    await bookWithBoard();
    setMainTab("board");
    toggleFocusMode();
    expect(state.focus).toBe(false);
    setMainTab("editor");
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test src/store/actions/board.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/store/state.ts`: import `BoardCard`; in `AppState` after the `area*` fields:

```ts
  /** The open book's board: cards in order, texts loaded so far, the selected card. */
  board: BoardCard[];
  boardText: Record<string, string>;
  boardSel: string | null;
```

and in the initial store `board: [], boardText: {}, boardSel: null,`. Also add `board: [], boardText: {}, boardSel: null` to `src/test/newBook.ts`'s `setState`.

`src/store/actions/tabs.ts`:

```ts
import { state } from "../state";
import { updatePrefs } from "./prefs";

export type MainTab = "editor" | "board";

/** Tab of the main pane for the open book; saved per book in the Rust prefs. */
export const mainTab = (): MainTab => (state.book && state.prefs.boardTab.includes(state.book.id) ? "board" : "editor");

export function setMainTab(tab: MainTab) {
  const id = state.book?.id;
  if (!id || mainTab() === tab) return;
  const others = state.prefs.boardTab.filter((x) => x !== id);
  updatePrefs({ boardTab: tab === "board" ? [...others, id] : others });
}
```

`src/store/actions/boardText.ts`:

```ts
import * as api from "../../api/board";
import { CARD_TEXT_MAX, CARD_TITLE_MAX } from "../../lib/constants";
import { registerFlusher } from "../saving";
import { setState, state } from "../state";
import { run } from "./run";

// Title and text typed on a board card: shown at once, saved a moment later. One card is
// pending at a time; the book is bound when typed, so a book switch cannot redirect it.

const DELAY = 300;
const cut = (s: string, max: number) => Array.from(s).slice(0, max).join("");

let pending: { bookId: string; id: string; title?: string; text?: string; timer: ReturnType<typeof setTimeout> } | null = null;

function schedule(id: string, patch: { title?: string; text?: string }) {
  const bookId = state.book?.id;
  if (!bookId) return;
  if (pending && (pending.id !== id || pending.bookId !== bookId)) void flushCard();
  if (pending) clearTimeout(pending.timer);
  pending = { ...(pending ?? { bookId, id }), ...patch, timer: setTimeout(() => void flushCard(), DELAY) };
}

export function scheduleCardTitle(id: string, title: string) {
  const t = cut(title, CARD_TITLE_MAX);
  setState("board", (c) => c.id === id, "title", t);
  schedule(id, { title: t });
}

export function scheduleCardText(id: string, text: string) {
  const t = cut(text, CARD_TEXT_MAX);
  setState("boardText", id, t);
  schedule(id, { text: t });
}

/** Forgets the pending edit of a card about to be deleted. */
export function dropCardEdit(id: string) {
  if (pending?.id !== id) return;
  clearTimeout(pending.timer);
  pending = null;
}

/** Saves the pending edit now, if any: on leaving the field and in `flushAll`. */
export function flushCard() {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  return run(async () => {
    if (p.title !== undefined) await api.boardRename(p.bookId, p.id, p.title);
    if (p.text !== undefined) await api.boardSaveText(p.bookId, p.id, p.text);
  });
}
registerFlusher(flushCard);
```

`src/store/actions/board.ts`:

```ts
import * as api from "../../api/board";
import { askConfirm } from "../confirm";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { dropCardEdit } from "./boardText";
import { run as runAction } from "./run";

/** Runs a board action; a stale card id reloads the board instead of showing an error. */
const run = (fn: () => Promise<void>) =>
  runAction(fn, async (e) => {
    if (e !== "Cartão não encontrado" || !state.book) return false;
    await loadBoard(state.book.id);
    return true;
  });

export function selectCard(id: string | null) {
  setState("boardSel", id);
}

/** The board of `bookId` (cards only; texts load as cards show). */
export async function loadBoard(bookId: string) {
  await run(async () => {
    const cards = await api.boardList(bookId);
    if (state.book?.id === bookId) setState({ board: cards });
  });
}

/** Loads a card's text once; later calls keep what is in memory (maybe being typed). */
export function loadCardText(id: string) {
  const b = state.book;
  if (!b || state.boardText[id] !== undefined) return;
  return run(async () => {
    const text = await api.boardLoadText(b.id, id);
    if (state.book?.id === b.id && state.boardText[id] === undefined) setState("boardText", id, text);
  });
}

/** New empty card at `index` (default: the end), selected. */
export function createCard(index?: number) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    const { id, cards } = await api.boardCreate(b.id, index ?? state.board.length, "");
    setState({ board: cards, boardSel: id });
    setState("boardText", id, "");
  });
}

export function moveCard(id: string, index: number) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    setState("board", await api.boardMove(b.id, id, index));
  });
}

export function duplicateCard(id: string) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    const { id: copy, cards } = await api.boardDuplicate(b.id, id);
    setState({ board: cards, boardSel: copy });
    const text = state.boardText[id];
    if (text !== undefined) setState("boardText", copy, text);
  });
}

/** Deletes for good (no question: `requestCardDelete` is the user-facing entry). */
export function deleteCard(id: string) {
  const b = state.book;
  if (!b) return;
  dropCardEdit(id);
  return run(async () => {
    await flushAll();
    setState("board", await api.boardDelete(b.id, id));
    if (state.boardSel === id) setState("boardSel", null);
  });
}

export async function requestCardDelete(id: string) {
  const card = state.board.find((c) => c.id === id);
  if (!card) return;
  const ok = await askConfirm({
    title: "Excluir “" + (card.title.trim() || "Sem título") + "”?",
    message: "O cartão e o texto dele serão excluídos.",
    confirmLabel: "Excluir",
    danger: true,
  });
  if (ok) await deleteCard(id);
}
```

`src/store/actions/library.ts` `openBook`: in the `setState({ … })` inside `apply`, add `board: [], boardText: {}, boardSel: null,`; after `if (prev && prev !== id) backupAuto(prev);` add `void loadBoard(id);` (import from `./board`).

`src/store/actions/open.ts` `openNode`: right after `if (isContainer(node.kind)) return toggleExpanded(id);` add

```ts
  // Opening a document shows it: the main pane goes back to the Editor tab.
  setMainTab("editor");
```

(import `setMainTab` from `./tabs`).

`src/store/actions/ui.ts` `toggleFocusMode`: at the start

```ts
  // Focus mode is for writing: the board tab has no text being written.
  if (!state.focus && mainTab() === "board") return;
```

(import `mainTab` from `./tabs`; if this creates an import cycle error at runtime — `tabs` → `prefs` → `ui` — move the check to the caller in `store/keys/global.ts` instead and ledger it.)

If `answerConfirm` has a different name/signature in `src/store/confirm.ts`, use what `workspace.test.ts` uses to answer the dialog.

- [ ] **Step 4: Run to verify they pass**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/state.ts src/test/newBook.ts src/store/actions/boardText.ts src/store/actions/board.ts src/store/actions/tabs.ts src/store/actions/library.ts src/store/actions/open.ts src/store/actions/ui.ts src/store/actions/board.test.ts
git commit -m "feat(board): board store, pending card edits and the main tab"
```

---

### Task 8: Board keys, card order and menus

**Files:**
- Modify: `src/store/focus.ts` (`"board"` target)
- Create: `src/lib/cardOrder.ts`, test `src/lib/cardOrder.test.ts`
- Create: `src/store/keys/board.ts`, `src/store/keys/cardField.ts`, test `src/store/keys/board.test.ts`
- Create: `src/components/board/boardMenu.ts`, test `src/components/board/boardMenu.test.ts`

**Interfaces:**
- Consumes: Task 7; `gridStep`, `isGridKey` (`lib/grid.ts`); `MenuItem`.
- Produces:
  - `cardDropIndex(ids: string[], dragId: string, targetId: string, pos: "before" | "after"): number | null` — index after taking `dragId` out; null when nothing moves.
  - `boardKey(e: KeyboardEvent, ids: string[], cols: number, edit: (id: string) => void, openMenu: () => void): void`.
  - `cardFieldKey(e: KeyboardEvent, onEscape: () => void, onEnter?: () => void): void` — stops propagation of keys without Ctrl/Cmd.
  - `cardMenu(id: string): MenuItem[]` ("Novo cartão depois", "Duplicar", "Excluir"), `backgroundMenu(): MenuItem[]` ("Novo cartão").

- [ ] **Step 1: Write the failing tests**

`src/lib/cardOrder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cardDropIndex } from "./cardOrder";

const ids = ["a", "b", "c", "d"];

describe("cardDropIndex", () => {
  it("gives the index after taking the dragged card out", () => {
    expect(cardDropIndex(ids, "a", "c", "after")).toBe(2);
    expect(cardDropIndex(ids, "a", "c", "before")).toBe(1);
    expect(cardDropIndex(ids, "d", "a", "before")).toBe(0);
    expect(cardDropIndex(ids, "d", "b", "after")).toBe(2);
  });

  it("is null when nothing moves", () => {
    expect(cardDropIndex(ids, "b", "b", "after")).toBeNull();
    expect(cardDropIndex(ids, "b", "c", "before")).toBeNull();
    expect(cardDropIndex(ids, "b", "a", "after")).toBeNull();
    expect(cardDropIndex(ids, "zz", "a", "after")).toBeNull();
  });
});
```

`src/store/keys/board.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { setState, state } from "../state";
import { boardKey } from "./board";
import { cardFieldKey } from "./cardField";

function board(ids: string[], cols: number, edit = vi.fn(), openMenu = vi.fn()) {
  const el = document.createElement("div");
  const field = document.createElement("textarea");
  el.appendChild(field);
  el.addEventListener("keydown", (e) => boardKey(e, ids, cols, edit, openMenu));
  const press = (key: string, from: HTMLElement = el, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    from.dispatchEvent(e);
    return e;
  };
  return { field, press, edit, openMenu };
}

describe("boardKey", () => {
  it("arrows move the selection; Enter edits; menu key opens the menu", () => {
    setState("boardSel", "a");
    const { press, edit, openMenu } = board(["a", "b", "c", "d"], 2);
    press("ArrowRight");
    expect(state.boardSel).toBe("b");
    press("ArrowDown");
    expect(state.boardSel).toBe("d");
    press("Enter");
    expect(edit).toHaveBeenCalledWith("d");
    press("ContextMenu");
    expect(openMenu).toHaveBeenCalledOnce();
  });

  it("ignores keys that come from a card field and Ctrl/Alt chords", () => {
    setState("boardSel", "a");
    const { field, press } = board(["a", "b"], 2);
    press("ArrowRight", field);
    press("ArrowRight", undefined, { ctrlKey: true });
    expect(state.boardSel).toBe("a");
  });
});

describe("card field keys", () => {
  const fire = (key: string, init: KeyboardEventInit = {}) => {
    const outer = vi.fn();
    const wrap = document.createElement("div");
    const field = document.createElement("input");
    wrap.appendChild(field);
    wrap.addEventListener("keydown", outer);
    const onEscape = vi.fn();
    const onEnter = vi.fn();
    field.addEventListener("keydown", (e) => cardFieldKey(e, onEscape, onEnter));
    field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
    return { outer, onEscape, onEnter };
  };

  it("keeps plain keys inside the field", () => {
    expect(fire("n").outer).not.toHaveBeenCalled();
    expect(fire("Delete").outer).not.toHaveBeenCalled();
  });

  it("lets Ctrl/Cmd chords reach the global shortcuts", () => {
    expect(fire("k", { ctrlKey: true }).outer).toHaveBeenCalled();
    expect(fire("o", { metaKey: true }).outer).toHaveBeenCalled();
  });

  it("Esc and Enter call back", () => {
    expect(fire("Escape").onEscape).toHaveBeenCalled();
    expect(fire("Enter").onEnter).toHaveBeenCalled();
  });
});
```

`src/components/board/boardMenu.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { backgroundMenu, cardMenu } from "./boardMenu";

describe("board menus", () => {
  it("has the card and background items", () => {
    expect(cardMenu("a").map((i) => i.label)).toEqual(["Novo cartão depois", "Duplicar", "Excluir"]);
    expect(cardMenu("a")[2].danger).toBe(true);
    expect(backgroundMenu().map((i) => i.label)).toEqual(["Novo cartão"]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun run test src/lib/cardOrder.test.ts src/store/keys/board.test.ts src/components/board`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

`src/store/focus.ts`: add `| "board"` to `FocusTarget`.

`src/lib/cardOrder.ts`:

```ts
/**
 * Where dropping card `dragId` before/after `targetId` lands it, as the index after taking
 * `dragId` out (what `board_move` expects). Null when either id is unknown or nothing moves.
 */
export function cardDropIndex(ids: string[], dragId: string, targetId: string, pos: "before" | "after"): number | null {
  const from = ids.indexOf(dragId);
  if (from < 0 || !ids.includes(targetId) || dragId === targetId) return null;
  const rest = ids.filter((id) => id !== dragId);
  const to = rest.indexOf(targetId) + (pos === "after" ? 1 : 0);
  return to === from ? null : to;
}
```

`src/store/keys/cardField.ts`:

```ts
/**
 * Keys typed into a card's title or text: plain keys belong to the field (the board and the
 * tree must not see them); Ctrl/Cmd chords go on to the global shortcuts. Esc and Enter
 * (title only) call back.
 */
export function cardFieldKey(e: KeyboardEvent, onEscape: () => void, onEnter?: () => void) {
  if (e.ctrlKey || e.metaKey) return;
  e.stopPropagation();
  if (e.key === "Escape") {
    e.preventDefault();
    onEscape();
  } else if (e.key === "Enter" && onEnter) {
    e.preventDefault();
    onEnter();
  }
}
```

`src/store/keys/board.ts`:

```ts
import { gridStep, isGridKey } from "../../lib/grid";
import { requestCardDelete, selectCard } from "../actions/board";
import { focusTarget } from "../focus";
import { state } from "../state";

/**
 * Board (focused, no Ctrl/Alt): arrows move the selection across the grid, Enter edits the
 * selected card's text, Delete asks to delete it, Esc goes back to the tree, the menu key
 * (or Shift F10) opens its menu. Keys typed into a card field belong to the field.
 */
export function boardKey(e: KeyboardEvent, ids: string[], cols: number, edit: (id: string) => void, openMenu: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const i = state.boardSel ? ids.indexOf(state.boardSel) : -1;
  let handled = true;

  if (isGridKey(e.key)) {
    const to = gridStep(i, ids.length, cols, e.key);
    if (to >= 0) selectCard(ids[to]);
  } else if (e.key === "Enter") {
    if (i >= 0) edit(ids[i]);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (i >= 0) void requestCardDelete(ids[i]);
  } else if (e.key === "Escape") focusTarget("tree");
  else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) openMenu();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
```

`src/components/board/boardMenu.ts`:

```ts
import { createCard, duplicateCard, requestCardDelete } from "../../store/actions/board";
import { state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

/** Right click on a card. */
export function cardMenu(id: string): MenuItem[] {
  return [
    {
      label: "Novo cartão depois",
      act: () => void createCard(state.board.findIndex((c) => c.id === id) + 1),
    },
    { label: "Duplicar", act: () => void duplicateCard(id) },
    { label: "Excluir", danger: true, act: () => void requestCardDelete(id) },
  ];
}

/** Right click on the board's background: a card at the end. */
export function backgroundMenu(): MenuItem[] {
  return [{ label: "Novo cartão", act: () => void createCard() }];
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p .`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/focus.ts src/lib/cardOrder.ts src/lib/cardOrder.test.ts src/store/keys/board.ts src/store/keys/cardField.ts src/store/keys/board.test.ts src/components/board/boardMenu.ts src/components/board/boardMenu.test.ts
git commit -m "feat(board): board keys, drop index and menus"
```

---

### Task 9: Board screen and the Editor | Quadro tabs

**Files:**
- Create: `src/components/board/cardDrag.ts`
- Create: `src/components/board/BoardCard.tsx`, `src/components/board/BoardView.tsx`
- Create: `src/components/workspace/MainTabs.tsx`
- Modify: `src/components/workspace/Workspace.tsx`
- Create: `src/styles/board.css`; Modify: `src/styles/global.css` (import)
- Test: `src/components/board/BoardView.test.tsx`

**Interfaces:**
- Consumes: Tasks 6–8; `ContextMenu`, `Hint`, `focusRef`, `focusHandler`, `updatePrefs`.
- Produces: `<BoardView />`, `<BoardCard card={BoardCard} onMenu={(x, y) => void} onEditText={(id) => void} />`, `<MainTabs />`, `cardTitleId(id)`, `cardTextId(id)`, `cardDomId(id)`.

- [ ] **Step 1: Write the failing test** — `src/components/board/BoardView.test.tsx`:

```tsx
import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { createCard, loadBoard } from "../../store/actions/board";
import { setState, state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { BoardView } from "./BoardView";

async function mounted() {
  const book = await newBook();
  setState({ board: [], boardText: {}, boardSel: null });
  await loadBoard(book.id);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <BoardView />, host);
  return { host, done: () => (dispose(), host.remove()) };
}

describe("BoardView", () => {
  it("shows the empty state, then one card per board card", async () => {
    const { host, done } = await mounted();
    expect(host.textContent).toContain("Nenhum cartão ainda.");
    await createCard();
    await createCard();
    expect(host.querySelectorAll("[data-card-id]").length).toBe(2);
    done();
  });

  it("typing in a card's text updates the store", async () => {
    const { host, done } = await mounted();
    await createCard();
    const ta = host.querySelector<HTMLTextAreaElement>(".bcard-text")!;
    ta.value = "Introduz o mundo";
    ta.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(state.boardText[state.board[0].id]).toBe("Introduz o mundo");
    done();
  });

  it("keeps a card mounted when the list is replaced by a fresh copy", async () => {
    const { host, done } = await mounted();
    await createCard();
    const before = host.querySelector(".bcard-text");
    setState("board", JSON.parse(JSON.stringify(state.board)));
    expect(host.querySelector(".bcard-text")).toBe(before);
    done();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run test src/components/board/BoardView.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/components/board/cardDrag.ts` (pointer drag, same approach as `workspace/dragMove.ts`):

```ts
import { createSignal } from "solid-js";
import { cardDropIndex } from "../../lib/cardOrder";
import { moveCard } from "../../store/actions/board";
import { state } from "../../store/state";

/** Reordering board cards with pointer events (HTML5 drag and drop never reaches the webview on Windows). */

const DRAG_START = 4;

export interface CardDrag {
  dragId: string;
  targetId: string | null;
  pos: "before" | "after" | null;
}

const [cardDrag, setCardDrag] = createSignal<CardDrag | null>(null);
export { cardDrag };

let swallowClick = false;

/** True once right after a drag ends: the click the browser fires then is not a real click. */
export function consumeCardClick(): boolean {
  const was = swallowClick;
  swallowClick = false;
  return was;
}

export function pointerDownOnCard(e: PointerEvent, id: string) {
  swallowClick = false;
  if (e.button !== 0) return;
  const card = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;
  const ids = () => state.board.map((c) => c.id);

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
    const pos = r.width > 0 && (ev.clientX - r.left) / r.width >= 0.5 ? "after" : "before";
    const ok = cardDropIndex(ids(), id, targetId, pos) !== null;
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
    if (!active || !d?.targetId || !d.pos) return;
    const to = cardDropIndex(ids(), d.dragId, d.targetId, d.pos);
    if (to !== null) void moveCard(d.dragId, to);
  };

  const cancel = () => {
    end();
    setCardDrag(null);
  };

  const key = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !active) return;
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

`src/components/board/BoardCard.tsx`:

```tsx
import { onMount } from "solid-js";
import type { BoardCard as Card } from "../../api/types";
import { loadCardText, selectCard } from "../../store/actions/board";
import { flushCard, scheduleCardText, scheduleCardTitle } from "../../store/actions/boardText";
import { focusTarget } from "../../store/focus";
import { cardFieldKey } from "../../store/keys/cardField";
import { state } from "../../store/state";
import { cardDrag, consumeCardClick, pointerDownOnCard } from "./cardDrag";

export const cardDomId = (id: string) => "bcard-" + id;
export const cardTitleId = (id: string) => "bcard-title-" + id;
export const cardTextId = (id: string) => "bcard-text-" + id;

const stop = (e: Event) => e.stopPropagation();

/** One index card: a ruled card with its title over a red line and its text on the rules. */
export function BoardCard(props: { card: Card; onMenu: (x: number, y: number) => void; onEditText: (id: string) => void }) {
  const id = () => props.card.id;
  onMount(() => void loadCardText(id()));
  const dropHere = () => {
    const d = cardDrag();
    return d && d.targetId === id() ? d.pos : null;
  };
  const leave = () => {
    void flushCard();
  };
  const back = () => focusTarget("board");
  return (
    <div
      id={cardDomId(id())}
      role="option"
      class="bcard"
      classList={{
        sel: state.boardSel === id(),
        dragging: cardDrag()?.dragId === id(),
        "drop-before": dropHere() === "before",
        "drop-after": dropHere() === "after",
      }}
      aria-selected={state.boardSel === id()}
      data-card-id={id()}
      onPointerDown={(e) => pointerDownOnCard(e, id())}
      onClick={() => {
        if (consumeCardClick()) return;
        selectCard(id());
        focusTarget("board");
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        selectCard(id());
        props.onMenu(e.clientX, e.clientY);
      }}
    >
      <input
        id={cardTitleId(id())}
        class="bcard-title"
        aria-label="Título do cartão"
        placeholder="Título do cartão"
        value={props.card.title}
        onInput={(e) => scheduleCardTitle(id(), e.currentTarget.value)}
        onFocus={() => selectCard(id())}
        onBlur={leave}
        onKeyDown={(e) => cardFieldKey(e, back, () => props.onEditText(id()))}
        onPointerDown={stop}
        onClick={stop}
        autocomplete="off"
      />
      <textarea
        id={cardTextId(id())}
        class="bcard-text"
        aria-label="Texto do cartão"
        placeholder="Anote aqui…"
        value={state.boardText[id()] ?? ""}
        onInput={(e) => scheduleCardText(id(), e.currentTarget.value)}
        onFocus={() => selectCard(id())}
        onBlur={leave}
        onKeyDown={(e) => cardFieldKey(e, back)}
        onPointerDown={stop}
        onClick={stop}
      />
    </div>
  );
}
```

`src/components/board/BoardView.tsx`:

```tsx
import { createEffect, createSignal, For, Show } from "solid-js";
import { createCard } from "../../store/actions/board";
import { updatePrefs } from "../../store/actions/prefs";
import { focusRef } from "../../store/focus";
import { boardKey } from "../../store/keys/board";
import { state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { Hint } from "../ui/Hint";
import { BoardCard, cardDomId, cardTextId, cardTitleId } from "./BoardCard";
import { backgroundMenu, cardMenu } from "./boardMenu";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

const SIZES = ["P", "M", "G"] as const;

/** Columns the grid laid out, as the browser computed them (1 when it cannot tell). */
function gridColumns(el: HTMLElement | undefined): number {
  if (!el) return 1;
  return getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}

const focusField = (domId: string) => requestAnimationFrame(() => document.getElementById(domId)?.focus());

/** The book's board: free cards on cork, in the saved order. */
export function BoardView() {
  let grid: HTMLDivElement | undefined;
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const ids = () => state.board.map((c) => c.id);
  const editText = (id: string) => focusField(cardTextId(id));

  // A new card opens on its title.
  let known = new Set(ids());
  createEffect(() => {
    const now = ids();
    const fresh = now.find((id) => !known.has(id));
    known = new Set(now);
    if (fresh && state.boardSel === fresh) focusField(cardTitleId(fresh));
  });

  createEffect(() => {
    const id = state.boardSel;
    if (id) document.getElementById(cardDomId(id))?.scrollIntoView({ block: "nearest" });
  });

  const openMenuAtSelection = () => {
    const id = state.boardSel;
    const r = id ? document.getElementById(cardDomId(id))?.getBoundingClientRect() : null;
    if (id && r) setMenu({ x: r.left + 24, y: r.top + 32, items: cardMenu(id) });
  };

  return (
    <div class="board" data-size={state.prefs.cardSize}>
      <div class="board-head">
        <button type="button" class="sp-btn" onClick={() => void createCard()}>
          + Novo cartão
        </button>
        <div class="board-size" role="group" aria-label="Tamanho">
          <span class="ui">Tamanho</span>
          <For each={SIZES}>
            {(label, i) => (
              <button
                type="button"
                class="ui crumb"
                classList={{ on: state.prefs.cardSize === i() }}
                aria-pressed={state.prefs.cardSize === i()}
                onClick={() => updatePrefs({ cardSize: i() as 0 | 1 | 2 })}
              >
                {label}
              </button>
            )}
          </For>
        </div>
      </div>
      <div
        ref={(el) => {
          grid = el;
          focusRef("board")(el);
        }}
        class="board-cork"
        role="listbox"
        aria-label="Cartões do quadro"
        tabIndex={0}
        aria-activedescendant={state.boardSel ? cardDomId(state.boardSel) : undefined}
        onKeyDown={(e) => boardKey(e, ids(), gridColumns(grid), editText, openMenuAtSelection)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, items: backgroundMenu() });
        }}
      >
        <Show when={state.board.length > 0} fallback={<EmptyBoard />}>
          {/* Keyed by id: a fresh list from Rust keeps the cards (and a focused field) mounted. */}
          <For each={ids()}>
            {(id) => {
              const card = () => state.board.find((c) => c.id === id);
              return (
                <Show when={card()}>
                  {(c) => (
                    <BoardCard
                      card={c()}
                      onEditText={editText}
                      onMenu={(x, y) => setMenu({ x, y, items: cardMenu(id) })}
                    />
                  )}
                </Show>
              );
            }}
          </For>
        </Show>
      </div>
      <div class="ws-help">
        <Hint keys="←↑↓→">escolher</Hint>
        <Hint keys="Enter">escrever</Hint>
        <Hint keys="Esc">voltar à árvore</Hint>
      </div>
      <Show when={menu()}>
        {(m) => (
          <ContextMenu x={m().x} y={m().y} items={m().items} onClose={() => setMenu(null)} />
        )}
      </Show>
    </div>
  );
}

function EmptyBoard() {
  return (
    <div class="board-empty">
      <p class="ui">Nenhum cartão ainda.</p>
      <button type="button" class="sp-btn" onClick={() => void createCard()}>
        Novo cartão
      </button>
    </div>
  );
}
```

`src/components/workspace/MainTabs.tsx`:

```tsx
import { Show } from "solid-js";
import { mainTab, setMainTab, type MainTab } from "../../store/actions/tabs";
import { currentChapter } from "../../store/selectors/book";
import { BoardView } from "../board/BoardView";
import { Editor } from "../editor/Editor";
import { NodeView } from "./NodeView";

function Tab(props: { tab: MainTab; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      class="ws-tab ui"
      classList={{ on: mainTab() === props.tab }}
      aria-selected={mainTab() === props.tab}
      onClick={() => setMainTab(props.tab)}
    >
      {props.label}
    </button>
  );
}

/** Main pane of the book: the Editor tab (open chapter, text, image, file) or the book's Quadro. */
export function MainTabs() {
  return (
    <div class="ws-main-col">
      <div class="ws-tabs" role="tablist" aria-label="Visão">
        <Tab tab="editor" label="Editor" />
        <Tab tab="board" label="Quadro" />
      </div>
      <div class="ws-main" role="tabpanel">
        <Show when={mainTab() === "board"} fallback={
          // Non-keyed: moving between chapters keeps the chapter editor mounted.
          <Show when={currentChapter()} fallback={<NodeView />}>
            <Editor />
          </Show>
        }>
          <BoardView />
        </Show>
      </div>
    </div>
  );
}
```

`src/components/workspace/Workspace.tsx`: replace the `<div class="ws-main">…</div>` block with `<MainTabs />` (import it; drop now-unused `Editor`, `NodeView`, `currentChapter` imports). Keep the tab bar hidden in focus mode: in `MainTabs`, wrap the `ws-tabs` div in `<Show when={!state.focus}>` (import `state`).

`src/styles/board.css`:

```css
/* The book's board: ruled index cards on cork. */
@layer components {
  .ws-main-col {
    flex-grow: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .ws-main-col > .ws-main {
    flex: 1;
    min-height: 0;
  }
  .ws-tabs {
    display: flex;
    gap: 4px;
    padding: 6px 16px 0;
    border-bottom: 1px solid var(--faint);
  }
  .ws-tab {
    border: 0;
    background: transparent;
    padding: 6px 12px;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    cursor: pointer;
  }
  .ws-tab.on {
    color: var(--ink);
    border-bottom-color: var(--accent);
  }
  .board {
    --card-w: 300px;
    --card-h: 180px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 16px 24px;
    box-sizing: border-box;
  }
  .board[data-size="0"] {
    --card-w: 220px;
    --card-h: 132px;
  }
  .board[data-size="2"] {
    --card-w: 380px;
    --card-h: 228px;
  }
  .board-head,
  .board-size {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .board-head {
    justify-content: space-between;
  }
  .board-size .crumb.on {
    color: var(--accent);
    font-weight: 600;
  }
  .board-cork {
    --cork: #c8a47a;
    --cork-dot: rgba(90, 58, 26, 0.18);
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--card-w));
    grid-auto-rows: var(--card-h);
    gap: 20px;
    align-content: start;
    justify-content: center;
    padding: 24px;
    border-radius: 6px;
    outline: none;
    background-color: var(--cork);
    background-image: radial-gradient(var(--cork-dot) 1px, transparent 1.4px),
      radial-gradient(var(--cork-dot) 1px, transparent 1.4px);
    background-size: 7px 7px, 11px 11px;
    background-position: 0 0, 3px 5px;
  }
  .board-cork:focus-visible {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .board-empty {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 0;
    color: #3a2a18;
  }
  .bcard {
    --rule: #b9d4ea;
    --rule-red: #d9534f;
    --paper: #fffdf7;
    --paper-ink: #2a2a2a;
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 8px 12px 10px;
    box-sizing: border-box;
    background: var(--paper);
    color: var(--paper-ink);
    border-radius: 2px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25), 0 4px 10px rgba(0, 0, 0, 0.12);
    user-select: none;
  }
  .bcard.sel {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .bcard.dragging {
    opacity: 0.5;
  }
  .bcard.drop-before::before,
  .bcard.drop-after::after {
    content: "";
    position: absolute;
    top: 8px;
    bottom: 8px;
    width: 3px;
    border-radius: 2px;
    background: var(--accent);
  }
  .bcard.drop-before::before {
    left: -12px;
  }
  .bcard.drop-after::after {
    right: -12px;
  }
  .bcard-title {
    border: 0;
    outline: 0;
    background: transparent;
    color: var(--paper-ink);
    font: inherit;
    font-weight: 600;
    font-size: 15px;
    padding: 2px 0 6px;
    border-bottom: 1.5px solid var(--rule-red);
  }
  .bcard-text {
    flex: 1;
    min-height: 0;
    border: 0;
    outline: 0;
    resize: none;
    padding: 0;
    margin-top: 4px;
    color: var(--paper-ink);
    font: inherit;
    font-size: 14px;
    line-height: 22px;
    background: transparent;
    background-image: linear-gradient(transparent 21px, var(--rule) 21px, var(--rule) 22px);
    background-size: 100% 22px;
    background-attachment: local;
  }
  .bcard-title::placeholder,
  .bcard-text::placeholder {
    color: #6b6b6b;
  }
  @media (prefers-reduced-motion: no-preference) {
    .bcard {
      transition: opacity 0.15s ease, outline-color 0.15s ease;
    }
  }
}

/* Dark theme: dark felt, cards stay paper but dimmer. */
:root.dark .board-cork,
[data-theme="dark"] .board-cork {
  --cork: #3b3129;
  --cork-dot: rgba(0, 0, 0, 0.35);
}
:root.dark .bcard,
[data-theme="dark"] .bcard {
  --paper: #ece6d8;
  --rule: #a9bccb;
}
:root.dark .board-empty,
[data-theme="dark"] .board-empty {
  color: #e8dccb;
}
```

Before writing the dark-theme selectors, check how `global.css` scopes its dark tokens (`grep -n "dark" src/styles/global.css | head`) and use the same selector; keep one of the two shown.

`src/styles/global.css`: after the last `@import "@fontsource/…";` add `@import "./board.css";`.

- [ ] **Step 4: Run to verify it passes**

Run: `bun run test && ./node_modules/.bin/tsc --noEmit -p . && bun run build`
Expected: all PASS, build OK.

Then check by hand in `bun run dev`: tabs switch and are remembered per book; empty board message; "+ Novo cartão" creates a card with its title focused; typing title/text survives a book switch; drag reorders; right click on card and on background; P/M/G resize; dark theme is readable; opening a chapter in the tree goes back to Editor; `Ctrl .` does nothing on Quadro; `Ctrl K` works while typing in a card.

- [ ] **Step 5: Commit**

```bash
git add src/components/board/cardDrag.ts src/components/board/BoardCard.tsx src/components/board/BoardView.tsx src/components/board/BoardView.test.tsx src/components/workspace/MainTabs.tsx src/components/workspace/Workspace.tsx src/styles/board.css src/styles/global.css
git commit -m "feat(board): book board screen and the Editor | Quadro tabs"
```
