import { createSignal } from "solid-js";
import { dropTarget } from "../../lib/tree";
import { moveNode } from "../../store/actions/workspace";
import { state } from "../../store/state";

/**
 * Reordering index cards with pointer events (HTML5 drag and drop never reaches the webview
 * on Windows, see `workspace/dragMove.ts`). A card lands only before or after a sibling;
 * moving to another folder stays a tree gesture.
 */

/** Movement (px) before a press on a card becomes a drag; below it, it stays a click. */
const DRAG_START = 4;

export interface CardDrag {
  dragId: string;
  /** Card under the pointer, only when dropping there is allowed. */
  targetId: string | null;
  pos: "before" | "after" | null;
}

const [cardDrag, setCardDrag] = createSignal<CardDrag | null>(null);
export { cardDrag };

/** Where on a card the pointer is: the left half drops before it, the right half after. */
export function cardDropPos(offsetX: number, width: number): "before" | "after" {
  return width > 0 && offsetX / width >= 0.5 ? "after" : "before";
}

let swallowClick = false;

/** True once right after a drag ends: the click the browser fires then is not a real click. */
export function consumeCardClick(): boolean {
  const was = swallowClick;
  swallowClick = false;
  return was;
}

/** Starts tracking a press on card `id`; it becomes a drag only after the pointer moves. */
export function pointerDownOnCard(e: PointerEvent, id: string) {
  swallowClick = false;
  if (e.button !== 0) return;
  const card = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;

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
    const pos = cardDropPos(ev.clientX - r.left, r.width);
    const ok = dropTarget(state.area, id, targetId, pos) !== null;
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
    if (active && d?.targetId && d.pos) void moveNode(d.dragId, d.targetId, d.pos);
  };

  const cancel = () => {
    end();
    setCardDrag(null);
  };

  const key = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !active) return;
    // Capture phase on window: runs before the board and the global shortcuts.
    ev.preventDefault();
    ev.stopPropagation();
    cancel();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
}
