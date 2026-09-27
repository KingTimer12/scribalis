import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";
import type { BlockJSON, DocJSON } from "../api/types";

const isEmptyParagraph = (n: PMNode | null | undefined) => !!n && n.type.name === "paragraph" && n.content.size === 0;

function toDoc(blocks: BlockJSON[]): DocJSON {
  let start = 0;
  let end = blocks.length;
  const empty = (b: BlockJSON) => b.type === "paragraph" && !(b.content && b.content.length);
  while (start < end && empty(blocks[start])) start++;
  while (end > start && empty(blocks[end - 1])) end--;
  return { type: "doc", content: blocks.slice(start, end) };
}

/**
 * Enter ×3: the first two Enters left two empty paragraphs right before the cursor
 * (or the cursor sits in the second one). Returns the content before and after them.
 */
export function splitAtCursor(state: EditorState): { before: DocJSON; after: DocJSON } | null {
  const { $from, empty } = state.selection;
  if (!empty || $from.depth !== 1 || $from.parent.type.name !== "paragraph" || $from.parentOffset !== 0) return null;
  const i = $from.index(0);
  const emptyAt = (k: number) => k >= 0 && isEmptyParagraph(state.doc.child(k));
  const blocks = (state.doc.toJSON() as DocJSON).content;
  if ($from.parent.content.size === 0) {
    if (!emptyAt(i - 1)) return null;
    return { before: toDoc(blocks.slice(0, i - 1)), after: toDoc(blocks.slice(i + 1)) };
  }
  if (!emptyAt(i - 1) || !emptyAt(i - 2)) return null;
  return { before: toDoc(blocks.slice(0, i - 2)), after: toDoc(blocks.slice(i)) };
}
