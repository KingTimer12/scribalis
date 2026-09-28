import { visibleRows, type Row } from "../../lib/tree";
import { createNode, openNode, requestDelete, selectNode, startNodeRename, toggleExpanded } from "../actions/workspace";
import { setState, state } from "../state";

/**
 * Workspace tree (focused, no Ctrl/Alt): arrows walk the visible rows, Enter opens,
 * F2 renames, Delete twice deletes, N / Shift N create. `openMenu` shows the context
 * menu of the selected row (menu key or Shift F10).
 */
export function treeKey(e: KeyboardEvent, openMenu: () => void) {
  // Keys typed into the rename field inside the tree are its own.
  if (e.target !== e.currentTarget) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const rows = visibleRows(state.area, new Set(state.areaExpanded));
  const i = rows.findIndex((r) => r.node.id === state.areaSel);
  const row: Row | undefined = rows[i];
  const pick = (r: Row | undefined) => r && selectNode(r.node.id);
  const expanded = (id: string) => state.areaExpanded.includes(id);
  let handled = true;

  switch (e.key) {
    case "ArrowDown":
      pick(rows[Math.min(rows.length - 1, i + 1)]);
      break;
    case "ArrowUp":
      pick(rows[Math.max(0, i - 1)]);
      break;
    case "Home":
      pick(rows[0]);
      break;
    case "End":
      pick(rows[rows.length - 1]);
      break;
    case "ArrowRight":
      if (row?.node.kind === "folder") {
        if (!expanded(row.node.id)) toggleExpanded(row.node.id);
        else if (row.node.children?.length) selectNode(row.node.children[0].id);
      }
      break;
    case "ArrowLeft":
      if (row?.node.kind === "folder" && expanded(row.node.id)) toggleExpanded(row.node.id);
      else if (row?.parent) selectNode(row.parent);
      break;
    case "Enter":
      if (row) void openNode(row.node.id);
      break;
    case "F2":
      if (row) startNodeRename(row.node.id);
      break;
    case "Delete":
    case "Backspace":
      if (row) void requestDelete(row.node.id);
      break;
    case "Escape":
      // Only a pending deletion is ours; otherwise the global Esc runs.
      if (state.areaConfirm) setState("areaConfirm", null);
      else handled = false;
      break;
    case "ContextMenu":
      openMenu();
      break;
    default:
      if (e.key === "F10" && e.shiftKey) openMenu();
      else if (e.code === "KeyN") void createNode(e.shiftKey ? "folder" : "text");
      else handled = false;
  }

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
