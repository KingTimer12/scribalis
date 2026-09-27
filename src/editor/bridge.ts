import type { Editor } from "@tiptap/core";
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

export function focusEditor(caret: number | "end" | null) {
  if (!editor) return;
  editor.commands.focus(caret === 0 ? "start" : caret === "end" ? "end" : caret, { scrollIntoView: caret !== null });
}

export function insertSeparator() {
  editor?.chain().focus().insertContent([{ type: "separator" }, { type: "paragraph" }]).run();
}

export function insertImage(src: string) {
  editor?.chain().focus().insertContent([{ type: "image", attrs: { src } }, { type: "paragraph" }]).run();
}
