import { areaExcerpts } from "../../api/workspace";
import { cardDropIndex } from "../../lib/cardOrder";
import { findNode } from "../../lib/tree";
import { setState, state } from "../state";
import { createQuietly, docKindUnder, moveTo } from "./workspace";

// The board shows the children of a tree node as index cards: everything a card edits
// (title, synopsis, order) is that node's, so these actions go through the tree's.

export function selectCard(id: string | null) {
  setState("boardSel", id);
}

/** Opening text of the documents under `parent`, shown on cards without a synopsis. */
export async function loadExcerpts(parent: string) {
  const b = state.book;
  if (!b) return;
  try {
    const got = await areaExcerpts(b.id, parent);
    if (state.book?.id === b.id) setState("boardExcerpts", got);
  } catch {
    // Placeholders only: a card without one still shows its synopsis field.
  }
}

/** New document under `parent` at `index` (default: the end), selected on the board. */
export async function createCard(parent: string, index?: number) {
  const at = index ?? findNode(state.area, parent)?.children?.length ?? 0;
  const id = await createQuietly(docKindUnder(parent), parent, at);
  if (id) selectCard(id);
  return id;
}

/** Drops card `dragId` before or after `targetId` among `parent`'s children. */
export function dropCard(parent: string, dragId: string, targetId: string, pos: "before" | "after") {
  const ids = (findNode(state.area, parent)?.children ?? []).map((c) => c.id);
  const to = cardDropIndex(ids, dragId, targetId, pos);
  if (to !== null) return moveTo(dragId, parent, to);
}
