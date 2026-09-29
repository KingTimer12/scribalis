import { gridStep, isGridKey } from "../../lib/grid";
import { openNode, selectNode } from "../actions/open";
import { focusTarget } from "../focus";
import { state } from "../state";

/**
 * Board of index cards (focused, no Ctrl/Alt): arrows move the selection across the grid,
 * Enter opens the selected card, Esc goes back to the tree, the menu key (or Shift F10)
 * opens the selected card's menu. Keys typed into a synopsis belong to the field.
 */
export function boardKey(e: KeyboardEvent, ids: string[], cols: number, openMenu: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const i = state.areaSel ? ids.indexOf(state.areaSel) : -1;
  let handled = true;

  if (isGridKey(e.key)) {
    const to = gridStep(i, ids.length, cols, e.key);
    if (to >= 0) selectNode(ids[to]);
  } else if (e.key === "Enter") {
    if (i >= 0) void openNode(ids[i]);
  } else if (e.key === "Escape") focusTarget("tree");
  else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) openMenu();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
