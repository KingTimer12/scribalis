import { createSignal } from "solid-js";
import { cardDropIndex } from "../../lib/cardOrder";
import { findNode } from "../../lib/tree";
import { dropCard } from "../../store/actions/board";
import { state } from "../../store/state";

/** Reordering board cards with pointer events (HTML5 drag and drop never reaches the webview on Windows). */

const DRAG_START = 4;

export interface CardDrag {
  dragId: string;
  targetId: string | null;
  pos: "before" | "after" | null;
}

const [cardDrag, setCardDrag] = createSignal<CardDrag | null>(null);
export { cardDrag };

let swallowClick = false;

/** True once right after a drag ends: the click the browser fires then is not a real click. */
export function consumeCardClick(): boolean {
  const was = swallowClick;
  swallowClick = false;
  return was;
}

/** Starts watching a press on card `id` of `parent`'s board; past a few pixels it becomes a drag. */
export function pointerDownOnCard(e: PointerEvent, parent: string, id: string) {
  swallowClick = false;
  if (e.button !== 0) return;
  const card = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;
  const ids = () => (findNode(state.area, parent)?.children ?? []).map((c) => c.id);

  const move = (ev: PointerEvent) => {
    if (!active) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START) return;
      active = true;
      try {
        card.setPointerCapture(ev.pointerId);
      } catch {
        // the pointer may already be gone; window listeners still track it
      }
    }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-card-id]");
    const targetId = hit?.dataset.cardId ?? null;
    if (!hit || !targetId) return setCardDrag({ dragId: id, targetId: null, pos: null });
    const r = hit.getBoundingClientRect();
    const pos = r.width > 0 && (ev.clientX - r.left) / r.width >= 0.5 ? "after" : "before";
    const ok = cardDropIndex(ids(), id, targetId, pos) !== null;
    setCardDrag({ dragId: id, targetId: ok ? targetId : null, pos: ok ? pos : null });
  };

  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    if (active) swallowClick = true;
  };

  const up = () => {
    const d = cardDrag();
    end();
    setCardDrag(null);
    if (!active || !d?.targetId || !d.pos) return;
    void dropCard(parent, d.dragId, d.targetId, d.pos);
  };

  const cancel = () => {
    end();
    setCardDrag(null);
  };

  const key = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !active) return;
    ev.preventDefault();
    ev.stopPropagation();
    cancel();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
}
