import { inManuscript, manuscriptOf } from "../../lib/manuscript";
import { state } from "../state";
import { createNode } from "./workspace";

// "New chapter" / "new text" from places that do not know where the selection is (palette,
// empty state). Rust refuses a text inside the Manuscrito and a chapter outside it, so each
// falls back to the right root instead of asking for something that would be refused.

const selectionInManuscript = () => !!state.areaSel && inManuscript(state.area, state.areaSel);

/** A chapter in the selected Manuscrito folder, or at the end of the Manuscrito. */
export function createChapterHere() {
  if (selectionInManuscript()) return createNode("chapter");
  const m = manuscriptOf(state.area);
  return createNode("chapter", { parent: m?.id ?? null, index: m?.children?.length ?? 0 });
}

/** A text in the selected folder outside the Manuscrito, or at the end of the tree. */
export function createTextHere() {
  if (selectionInManuscript()) return createNode("text", { parent: null, index: state.area.length });
  return createNode("text");
}
