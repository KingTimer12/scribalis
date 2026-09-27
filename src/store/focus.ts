/**
 * Foco programático. Componentes registram seus elementos com `focusRef`;
 * ações pedem foco com `focusTarget`, que roda depois que o DOM atualiza
 * (o elemento pode ter acabado de aparecer).
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

export const focusRef = (t: FocusTarget) => (el: HTMLElement) => {
  refs[t] = el;
};

export function focusTarget(t: FocusTarget, caret: Caret = null) {
  const first = pending === null;
  // o último pedido vence, como no protótipo
  pending = { t, caret };
  if (first) queueMicrotask(flush);
}

function flush() {
  const p = pending;
  pending = null;
  if (!p) return;
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
