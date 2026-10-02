// Pure helpers over a workspace ("area") tree: no I/O, no store access. They mirror the
// move semantics of the Rust `model::workspace` and `model::manuscript` modules
// so drag-and-drop in the UI computes exactly what `workspace_move` will accept.
import type { AreaNode, NodeKind } from "../api/types";

/** Folders and the Manuscrito: opening one shows its board of index cards. */
export const isFolder = (kind: NodeKind) => kind === "folder" || kind === "manuscript";

/** Kinds that hold children: folders, the Manuscrito, and documents (children are subdocuments). */
export const holdsChildren = (kind: NodeKind) => isFolder(kind) || kind === "chapter" || kind === "text";

/** True when a node shows a chevron in the tree: a folder, or a document with subdocuments. */
export const foldable = (node: AreaNode) => isFolder(node.kind) || !!node.children?.length;

/** The Manuscrito, wherever it sits (at the root or inside a folder). */
export function manuscriptOf(items: AreaNode[]): AreaNode | null {
  for (const node of items) {
    if (node.kind === "manuscript") return node;
    const found = manuscriptOf(node.children ?? []);
    if (found) return found;
  }
  return null;
}

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

/** Ids of the folders (and Manuscrito) around `id`, outermost first. */
export function ancestors(items: AreaNode[], id: string | null): string[] {
  const out: string[] = [];
  let loc = id ? locate(items, id) : null;
  while (loc?.parent) {
    out.unshift(loc.parent);
    loc = locate(items, loc.parent);
  }
  return out;
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
 * semantics `workspace_move` expects). Display-only hint: Rust stays authoritative. Returns
 * `null` when `dragId === targetId`, when `targetId` sits inside `dragId`'s own subtree, when
 * `pos` is "inside" something that holds no children, or when the Manuscrito would land inside
 * something other than a folder.
 */
export function dropTarget(items: AreaNode[], dragId: string, targetId: string, pos: DropPos): Location | null {
  if (dragId === targetId) return null;
  const dragged = findNode(items, dragId);
  const target = findNode(items, targetId);
  if (!dragged || !target) return null;
  if (pos === "inside" && !holdsChildren(target.kind)) return null;
  if (findNode(dragged.children ?? [], targetId)) return null;

  const pruned = withoutNode(items, dragId);
  // The Manuscrito sits at the root or inside folders, never inside a document.
  const fits = (parent: string | null) => dragged.kind !== "manuscript" || parent === null || findNode(pruned, parent)?.kind === "folder";
  if (pos === "inside") {
    const prunedTarget = findNode(pruned, targetId);
    return prunedTarget && fits(targetId) ? { parent: targetId, index: prunedTarget.children?.length ?? 0 } : null;
  }
  const loc = locate(pruned, targetId);
  if (!loc) return null;
  const index = pos === "after" ? loc.index + 1 : loc.index;
  if (!fits(loc.parent)) return null;
  return { parent: loc.parent, index };
}
