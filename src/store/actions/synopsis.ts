import { areaSetSynopsis } from "../../api/workspace";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { registerFlusher } from "../saving";
import { editNode, state } from "../state";
import { run } from "./run";

// The synopsis of any node, typed on its index card or in the notes drawer: shown at once,
// saved a moment later. The book is bound when typed: a book switch before the flush must
// not redirect it.

const DELAY = 300;

let pending: { bookId: string; id: string; synopsis: string; timer: ReturnType<typeof setTimeout> } | null = null;

export function scheduleSynopsis(id: string, synopsis: string) {
  const bookId = state.book?.id;
  if (!bookId) return;
  const text = Array.from(synopsis).slice(0, SYNOPSIS_MAX).join("");
  if (pending && (pending.id !== id || pending.bookId !== bookId)) void flushSynopsis();
  if (pending) clearTimeout(pending.timer);
  editNode(id, (n) => (n.synopsis = text));
  pending = { bookId, id, synopsis: text, timer: setTimeout(() => void flushSynopsis(), DELAY) };
}

/** Saves the pending synopsis now, if any: on leaving the field, closing the drawer and in `flushAll`. */
export function flushSynopsis() {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  // The tree already shows the text: only the write is left.
  return run(async () => {
    await areaSetSynopsis(p.bookId, p.id, p.synopsis);
  });
}
registerFlusher(flushSynopsis);
