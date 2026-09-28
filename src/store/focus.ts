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
  | "spacing"
  | "lib"
  | "libq"
  | "rename"
  | "tree"
  | "cloud";

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
  if (first) queueMicrotask(() => flush());
}

/**
 * A request queued right before the panel/element it targets gets created
 * (e.g. `openPanel` asks for "palette" before the store update that mounts
 * it) can run its microtask before Solid has mounted that element. Retry a
 * few animation frames before giving up, instead of silently dropping it.
 */
function flush(retriesLeft = 8) {
  const p = pending;
  if (!p) return;
  const handler = handlers[p.t];
  if (handler) {
    pending = null;
    return handler(p.caret);
  }
  const el = refs[p.t];
  if (!el || !el.isConnected) {
    if (retriesLeft > 0) requestAnimationFrame(() => flush(retriesLeft - 1));
    else pending = null;
    return;
  }
  pending = null;
  el.focus({ preventScroll: true });
  if (p.caret == null) return;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const pos = p.caret === "end" ? el.value.length : p.caret;
    el.setSelectionRange(pos, pos);
    if (p.t === "body") el.scrollTop = p.caret === "end" ? el.scrollHeight : 0;
  }
}
