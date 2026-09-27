import type { Editor } from "@tiptap/core";
import { createSignal } from "solid-js";
import type { Align } from "../api/types";
import { activeEditor } from "./bridge";
import type { SpacingAttrs } from "./spacing";

/** Transient formatting state for the caret/selection; never document data. */
export interface FormatState {
  bold: boolean;
  italic: boolean;
  align: Align;
  lineHeight: number | null;
  spaceBefore: number | null;
  spaceAfter: number | null;
  indent: number | null;
}

const INITIAL_FORMAT: FormatState = {
  bold: false,
  italic: false,
  align: "left",
  lineHeight: null,
  spaceBefore: null,
  spaceAfter: null,
  indent: null,
};

export const [formatState, setFormatState] = createSignal<FormatState>(INITIAL_FORMAT);

/** Reads marks at the cursor and the current paragraph's attributes. */
export function readFormat(editor: Editor): FormatState {
  const attrs = editor.state.selection.$from.parent.attrs as Record<string, unknown>;
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    align: (attrs.textAlign as Align | null) ?? "left",
    lineHeight: (attrs.lineHeight as number | null) ?? null,
    spaceBefore: (attrs.spaceBefore as number | null) ?? null,
    spaceAfter: (attrs.spaceAfter as number | null) ?? null,
    indent: (attrs.indent as number | null) ?? null,
  };
}

export function toggleBold() {
  activeEditor()?.chain().focus().toggleBold().run();
}

export function toggleItalic() {
  activeEditor()?.chain().focus().toggleItalic().run();
}

export function setAlign(a: Align) {
  activeEditor()?.chain().focus().setTextAlign(a).run();
}

/** Does not focus the editor: called with the caret still in a spacing panel field. */
export function setSpacing(attrs: SpacingAttrs) {
  activeEditor()?.chain().setSpacing(attrs).run();
}

/** Applies spacing to every paragraph in the chapter, then restores the caller's selection. */
export function applySpacingToAll(attrs: SpacingAttrs) {
  const editor = activeEditor();
  if (!editor) return;
  const { from, to } = editor.state.selection;
  editor.chain().selectAll().setSpacing(attrs).setTextSelection({ from, to }).run();
}

export function clearParagraphFormat() {
  activeEditor()?.chain().focus().clearParagraphFormat().run();
}
