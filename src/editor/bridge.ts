import type { Editor } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import type { DocJSON } from "../api/types";

/** Identifies which chapter the editor holds. */
export interface DocKey {
  bookId: string;
  chapterId: string;
}

export const sameKey = (a: DocKey | null, b: DocKey | null): boolean =>
  !!a && !!b && a.bookId === b.bookId && a.chapterId === b.chapterId;

/** Holds the mounted editor so store actions can talk to it. */
let editor: Editor | null = null;
let pending: { doc: DocJSON; key: DocKey } | null = null;
let loadedKey: DocKey | null = null;

export function setEditor(e: Editor | null) {
  editor = e;
  // A fresh (or no) editor holds no chapter until a document is loaded into it.
  loadedKey = null;
  if (e && pending) {
    const { doc, key } = pending;
    pending = null;
    loadDoc(doc, key);
  }
}

/** The schema requires `block+`; an empty doc (e.g. a fresh chapter, or a split half) needs a placeholder paragraph. */
export function normalizeDoc(doc: DocJSON): DocJSON {
  if (doc.content.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };
  return doc;
}

/** Replaces the document without triggering a save or an undo step; `key` names its chapter. */
export function loadDoc(doc: DocJSON, key: DocKey) {
  const normalized = normalizeDoc(doc);
  if (!editor) {
    pending = { doc: normalized, key };
    return;
  }
  editor.chain().setMeta("addToHistory", false).setContent(normalized, { emitUpdate: false }).run();
  loadedKey = { ...key };
}

/** The chapter currently in the editor, or null. */
export function currentDocKey(): DocKey | null {
  return editor && loadedKey ? { ...loadedKey } : null;
}

/** The editor's document, only if it still holds chapter `key` (else null). */
export function getDoc(key: DocKey): DocJSON | null {
  if (!editor || !sameKey(loadedKey, key)) return null;
  return editor.getJSON() as DocJSON;
}

export function liveText(): string {
  if (!editor) return "";
  const { doc } = editor.state;
  return doc.textBetween(0, doc.content.size, "\n\n", "\n");
}

/** Clamps `pos` into the document's addressable range. */
function clampPos(pos: number, min: number, max: number): number {
  return Math.min(Math.max(pos, min), max);
}

export function focusEditor(caret: number | "end" | null) {
  if (!editor) return;
  const { view } = editor;
  if (caret != null) {
    const { doc } = view.state;
    const atStart = Selection.atStart(doc);
    const atEnd = Selection.atEnd(doc);
    const selection =
      caret === "end"
        ? atEnd
        : caret === 0
          ? atStart
          : TextSelection.create(doc, clampPos(caret, atStart.from, atEnd.to));
    if (!view.state.selection.eq(selection)) view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  }
  // Focus synchronously via the low-level view API, not `editor.commands.focus()`:
  // that command always defers the actual DOM focus() to a requestAnimationFrame,
  // which can fire later and steal focus back into the editor from whatever the
  // user has since moved to (e.g. opening the command palette right after
  // switching chapters). `view.focus()` re-asserts the selection into the DOM
  // and focuses it immediately, with no dangling callback left behind.
  view.focus();
}

export function insertSeparator() {
  editor?.chain().focus().insertContent([{ type: "separator" }, { type: "paragraph" }]).run();
}

/** Inserts an image at the caret, or at the text under viewport point `at` when given. */
export function insertImage(src: string, at?: { x: number; y: number }) {
  if (!editor) return;
  const hit = at ? editor.view.posAtCoords({ left: at.x, top: at.y }) : null;
  const chain = editor.chain().focus();
  if (hit) chain.setTextSelection(hit.pos);
  chain.insertContent([{ type: "image", attrs: { src } }, { type: "paragraph" }]).run();
}
