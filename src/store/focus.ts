/**
 * Programmatic focus. Components register their elements with `focusRef`;
 * actions request focus with `focusTarget`, which runs after the DOM updates
 * (the element may have just appeared).
 */
export type FocusTarget =
  | "book"
  | "title"
  | "body"
  | "notes"
  | "index"
  | "palette"
  | "help"
  | "lib"
  | "libq"
  | "rename";

export type Caret = number | "end" | null;

const refs: Partial<Record<FocusTarget, HTMLElement>> = {};
let pending: { t: FocusTarget; caret: Caret } | null = null;

const handlers: Partial<Record<FocusTarget, (caret: Caret) => void>> = {};

/** For targets that are not plain inputs (the rich editor). */
export const focusHandler = (t: FocusTarget, fn: (caret: Caret) => void) => {
  handlers[t] = fn;
};

export const focusRef = (t: FocusTarget) => (el: HTMLElement) => {
  refs[t] = el;
};

export function focusTarget(t: FocusTarget, caret: Caret = null) {
  const first = pending === null;
  // the last request wins, as in the prototype
  pending = { t, caret };
  if (first) queueMicrotask(flush);
}

function flush() {
  const p = pending;
  pending = null;
  if (!p) return;
  const handler = handlers[p.t];
  if (handler) return handler(p.caret);
  const el = refs[p.t];
  if (!el || !el.isConnected) return;
  el.focus({ preventScroll: true });
  if (p.caret == null) return;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = p.caret === "end" ? el.value.length : p.caret;
    el.setSelectionRange(pos, pos);
    if (p.t === "body") el.scrollTop = p.caret === "end" ? el.scrollHeight : 0;
  }
}
