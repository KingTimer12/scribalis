import { createSignal } from "solid-js";
import { dropTarget, findNode, holdsChildren, type DropPos } from "../../lib/tree";
import { toggleExpanded } from "../../store/actions/expanded";
import { moveNode } from "../../store/actions/workspace";
import { state } from "../../store/state";

/**
 * Tree drag and drop with pointer events. HTML5 drag and drop is not an option:
 * on Windows, with Tauri's file drop enabled, `dragover`/`drop` never reach the webview.
 */

/** Movement (px) before a press on a row becomes a drag; below it, it stays a click. */
const DRAG_START = 4;
/** Hovering a closed folder this long (ms) while dragging opens it. */
const EXPAND_DELAY = 600;

export interface DragState {
  dragId: string;
  /** Row under the pointer, only when dropping there is allowed. */
  targetId: string | null;
  pos: DropPos | null;
}

const [drag, setDrag] = createSignal<DragState | null>(null);
export { drag };

/** Where in a row the pointer is: top quarter before, bottom quarter after, the middle inside a folder. */
export function dropPosAt(offsetY: number, height: number, isFolder: boolean): DropPos {
  const f = height > 0 ? offsetY / height : 0.5;
  if (isFolder) return f < 0.25 ? "before" : f > 0.75 ? "after" : "inside";
  return f < 0.5 ? "before" : "after";
}

let swallowClick = false;

/** True once right after a drag ends: the click the browser fires then is not a real click. */
export function consumeDragClick(): boolean {
  const was = swallowClick;
  swallowClick = false;
  return was;
}

/** Starts tracking a press on row `id`; it becomes a drag only after the pointer moves. */
export function pointerDownOnRow(e: PointerEvent, id: string) {
  swallowClick = false;
  if (e.button !== 0 || state.areaRenaming) return;
  const row = e.currentTarget as HTMLElement;
  const startX = e.clientX;
  const startY = e.clientY;
  let active = false;
  let hoverId: string | null = null;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;

  const hover = (folderId: string | null) => {
    if (folderId === hoverId) return;
    clearTimeout(hoverTimer);
    hoverId = folderId;
    if (!folderId) return;
    hoverTimer = setTimeout(() => {
      if (drag() && !state.areaExpanded.includes(folderId)) toggleExpanded(folderId);
    }, EXPAND_DELAY);
  };

  const move = (ev: PointerEvent) => {
    if (!active) {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START) return;
      active = true;
      try {
        row.setPointerCapture(ev.pointerId);
      } catch {
        // the pointer may already be gone; window listeners still track it
      }
    }
    const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-node-id]");
    const targetId = hit?.dataset.nodeId ?? null;
    const node = targetId ? findNode(state.area, targetId) : null;
    if (!hit || !targetId || !node) {
      hover(null);
      return setDrag({ dragId: id, targetId: null, pos: null });
    }
    const r = hit.getBoundingClientRect();
    const pos = dropPosAt(ev.clientY - r.top, r.height, holdsChildren(node.kind));
    const ok = dropTarget(state.area, id, targetId, pos) !== null;
    setDrag({ dragId: id, targetId: ok ? targetId : null, pos: ok ? pos : null });
    hover(holdsChildren(node.kind) && !state.areaExpanded.includes(targetId) ? targetId : null);
  };

  const end = () => {
    clearTimeout(hoverTimer);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("keydown", key, true);
    if (active) swallowClick = true;
  };

  const up = () => {
    const d = drag();
    end();
    setDrag(null);
    if (active && d?.targetId && d.pos) void moveNode(d.dragId, d.targetId, d.pos);
  };

  const cancel = () => {
    end();
    setDrag(null);
  };

  const key = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !active) return;
    // Capture phase on window: runs before the tree and the global shortcuts.
    ev.preventDefault();
    ev.stopPropagation();
    cancel();
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("keydown", key, true);
}
