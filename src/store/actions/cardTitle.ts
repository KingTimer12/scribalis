import { areaRename } from "../../api/workspace";
import { registerFlusher } from "../saving";
import { editNode, state } from "../state";
import { run } from "./run";

// A title typed on an index card: the tree shows it at once, Rust gets it a moment later.
// The book is bound when typed, so a book switch cannot redirect it.

const DELAY = 300;

let pending: { bookId: string; id: string; title: string; timer: ReturnType<typeof setTimeout> } | null = null;

export function scheduleCardTitle(id: string, title: string) {
  const bookId = state.book?.id;
  if (!bookId) return;
  if (pending && (pending.id !== id || pending.bookId !== bookId)) void flushCardTitle();
  if (pending) clearTimeout(pending.timer);
  editNode(id, (n) => (n.title = title));
  pending = { bookId, id, title, timer: setTimeout(() => void flushCardTitle(), DELAY) };
}

/** Saves the pending title now, if any: on leaving the field and in `flushAll`. */
export function flushCardTitle() {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  // The tree already shows the title: only the write is left.
  return run(async () => {
    await areaRename(p.bookId, p.id, p.title.trim());
  });
}
registerFlusher(flushCardTitle);
