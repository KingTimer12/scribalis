import type { Editor } from "@tiptap/core";
import { Selection, TextSelection } from "@tiptap/pm/state";
import type { DocJSON } from "../api/types";

/** Holds the mounted editor so store actions can talk to it. */
let editor: Editor | null = null;
let pendingDoc: DocJSON | null = null;

export function setEditor(e: Editor | null) {
  editor = e;
  if (e && pendingDoc) {
    const doc = pendingDoc;
    pendingDoc = null;
    loadDoc(doc);
  }
}

/** The schema requires `block+`; an empty doc (e.g. a fresh chapter, or a split half) needs a placeholder paragraph. */
export function normalizeDoc(doc: DocJSON): DocJSON {
  if (doc.content.length === 0) return { type: "doc", content: [{ type: "paragraph" }] };
  return doc;
}

/** Replaces the document without triggering a save or an undo step. */
export function loadDoc(doc: DocJSON) {
  const normalized = normalizeDoc(doc);
  if (!editor) {
    pendingDoc = normalized;
    return;
  }
  editor.chain().setMeta("addToHistory", false).setContent(normalized, { emitUpdate: false }).run();
}

export function getDoc(): DocJSON | null {
  return editor ? (editor.getJSON() as DocJSON) : null;
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

export function insertImage(src: string) {
  editor?.chain().focus().insertContent([{ type: "image", attrs: { src } }, { type: "paragraph" }]).run();
}
