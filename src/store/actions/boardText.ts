import * as api from "../../api/board";
import { CARD_TEXT_MAX, CARD_TITLE_MAX } from "../../lib/constants";
import { registerFlusher } from "../saving";
import { setState, state } from "../state";
import { run } from "./run";

// Title and text typed on a board card: shown at once, saved a moment later. One card is
// pending at a time; the book is bound when typed, so a book switch cannot redirect it.

const DELAY = 300;
const cut = (s: string, max: number) => Array.from(s).slice(0, max).join("");

let pending: { bookId: string; id: string; title?: string; text?: string; timer: ReturnType<typeof setTimeout> } | null = null;

function schedule(id: string, patch: { title?: string; text?: string }) {
  const bookId = state.book?.id;
  if (!bookId) return;
  if (pending && (pending.id !== id || pending.bookId !== bookId)) void flushCard();
  if (pending) clearTimeout(pending.timer);
  pending = { ...(pending ?? { bookId, id }), ...patch, timer: setTimeout(() => void flushCard(), DELAY) };
}

export function scheduleCardTitle(id: string, title: string) {
  const t = cut(title, CARD_TITLE_MAX);
  setState("board", (c) => c.id === id, "title", t);
  schedule(id, { title: t });
}

export function scheduleCardText(id: string, text: string) {
  const t = cut(text, CARD_TEXT_MAX);
  setState("boardText", id, t);
  schedule(id, { text: t });
}

/** Forgets the pending edit of a card about to be deleted. */
export function dropCardEdit(id: string) {
  if (pending?.id !== id) return;
  clearTimeout(pending.timer);
  pending = null;
}

/** Saves the pending edit now, if any: on leaving the field and in `flushAll`. */
export function flushCard() {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  return run(async () => {
    if (p.title !== undefined) await api.boardRename(p.bookId, p.id, p.title);
    if (p.text !== undefined) await api.boardSaveText(p.bookId, p.id, p.text);
  });
}
registerFlusher(flushCard);
