import { gridStep, isGridKey } from "../../lib/grid";
import { requestCardDelete, selectCard } from "../actions/board";
import { focusTarget } from "../focus";
import { state } from "../state";

/**
 * Board (focused, no Ctrl/Alt): arrows move the selection across the grid, Enter edits the
 * selected card's text, Delete asks to delete it, Esc goes back to the tree, the menu key
 * (or Shift F10) opens its menu. Keys typed into a card field belong to the field.
 */
export function boardKey(e: KeyboardEvent, ids: string[], cols: number, edit: (id: string) => void, openMenu: () => void) {
  if (e.target !== e.currentTarget) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const i = state.boardSel ? ids.indexOf(state.boardSel) : -1;
  let handled = true;

  if (isGridKey(e.key)) {
    const to = gridStep(i, ids.length, cols, e.key);
    if (to >= 0) selectCard(ids[to]);
  } else if (e.key === "Enter") {
    if (i >= 0) edit(ids[i]);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (i >= 0) void requestCardDelete(ids[i]);
  } else if (e.key === "Escape") focusTarget("tree");
  else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) openMenu();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
