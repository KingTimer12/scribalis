// Pure helpers over a workspace ("area") tree: no I/O, no store access. They mirror the
// move semantics of the Rust `model::workspace` module (src-tauri/src/model/workspace.rs)
// so drag-and-drop in the UI computes exactly what `workspace_move` will accept.
import type { AreaNode } from "../api/types";

/** Depth-first search for a node by id. */
export function findNode(items: AreaNode[], id: string): AreaNode | null {
  for (const node of items) {
    if (node.id === id) return node;
    const found = findNode(node.children ?? [], id);
    if (found) return found;
  }
  return null;
}

export interface Location {
  parent: string | null;
  index: number;
}

/** Where a node currently sits: its parent id (null at the root) and index in that list. */
export function locate(items: AreaNode[], id: string, parent: string | null = null): Location | null {
  const index = items.findIndex((node) => node.id === id);
  if (index >= 0) return { parent, index };
  for (const node of items) {
    const found = locate(node.children ?? [], id, node.id);
    if (found) return found;
  }
  return null;
}

export interface Row {
  node: AreaNode;
  depth: number;
  parent: string | null;
}

/** Flattened rows for the visible tree: a folder's children only show up when it is expanded. */
export function visibleRows(items: AreaNode[], expanded: Set<string>, depth = 0, parent: string | null = null): Row[] {
  const rows: Row[] = [];
  for (const node of items) {
    rows.push({ node, depth, parent });
    if (node.children && expanded.has(node.id)) rows.push(...visibleRows(node.children, expanded, depth + 1, node.id));
  }
  return rows;
}

export type DropPos = "before" | "after" | "inside";

/** A copy of `items` with node `id` removed, wherever it sits. */
function withoutNode(items: AreaNode[], id: string): AreaNode[] {
  const out: AreaNode[] = [];
  for (const node of items) {
    if (node.id === id) continue;
    out.push(node.children ? { ...node, children: withoutNode(node.children, id) } : node);
  }
  return out;
}

/**
 * Where dropping `dragId` onto `targetId` at `pos` would land it, as `{ parent, index }`
 * with `index` being the position after `dragId` is taken out of the tree (the same
 * semantics `workspace_move` expects). Returns `null` when `dragId === targetId`, when
 * `targetId` sits inside `dragId`'s own subtree, or when `pos` is "inside" a non-folder.
 */
export function dropTarget(items: AreaNode[], dragId: string, targetId: string, pos: DropPos): Location | null {
  if (dragId === targetId) return null;
  const dragged = findNode(items, dragId);
  const target = findNode(items, targetId);
  if (!dragged || !target) return null;
  if (pos === "inside" && target.kind !== "folder") return null;
  if (findNode(dragged.children ?? [], targetId)) return null;

  const pruned = withoutNode(items, dragId);
  if (pos === "inside") {
    const prunedTarget = findNode(pruned, targetId);
    return prunedTarget ? { parent: targetId, index: prunedTarget.children?.length ?? 0 } : null;
  }
  const loc = locate(pruned, targetId);
  return loc ? { parent: loc.parent, index: pos === "after" ? loc.index + 1 : loc.index } : null;
}
