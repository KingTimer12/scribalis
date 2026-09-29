import * as bookApi from "../../api/book";
import * as chapterApi from "../../api/chapter";
import type { AreaNode, DocJSON } from "../../api/types";
import { loadAreaDoc } from "../../api/workspace";
import { currentDocKey, sameKey, type DocKey } from "../../editor/bridge";
import { docWords } from "../../lib/doc";
import { chapterOrder } from "../../lib/manuscript";
import { findNode, isContainer } from "../../lib/tree";
import { focusTarget } from "../focus";
import { flushAll, settleDocSave, swapDocument } from "../saving";
import { currentChapter } from "../selectors/book";
import { setState, state } from "../state";
import { expand, reveal, toggleExpanded } from "./expanded";
import { run } from "./run";
import { flash } from "./ui";

/** Selects a node. */
export function selectNode(id: string | null) {
  setState({ areaSel: id });
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

/** First chapter in reading order whose file is still on disk. */
const firstChapter = (items: AreaNode[]) => chapterOrder(items).find((c) => !c.missing) ?? null;

/** Where a book opens: the remembered node when it still exists (a folder shows its board), else the first chapter that is not missing. */
export function initialNode(items: AreaNode[], open: string | null): AreaNode | null {
  const n = open ? findNode(items, open) : null;
  if (n && !n.missing) return n;
  return firstChapter(items);
}

/** Remembers the open node in Rust (not an edit); a failure only costs the next reopening. */
function remember(bookId: string, id: string) {
  if (state.book?.id === bookId) setState("book", "open", id);
  bookApi.updateBook(bookId, { open: id }).catch(() => {});
}

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
  const first = firstChapter(state.area);
  if (first) await openNode(first.id, false);
}
