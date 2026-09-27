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

/** Replaces the document without triggering a save or an undo step. */
export function loadDoc(doc: DocJSON) {
  if (!editor) {
    pendingDoc = doc;
    return;
  }
  editor.chain().setMeta("addToHistory", false).setContent(doc, { emitUpdate: false }).run();
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
  editor.commands.focus(caret === 0 ? "start" : caret === "end" ? "end" : null, { scrollIntoView: caret !== null });
}

export function insertSeparator() {
  editor?.chain().focus().insertContent([{ type: "separator" }, { type: "paragraph" }]).run();
}

export function insertImage(src: string) {
  editor?.chain().focus().insertContent([{ type: "image", attrs: { src } }, { type: "paragraph" }]).run();
}
