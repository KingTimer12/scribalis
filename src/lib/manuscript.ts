// Pure reading of the book's tree for display: the chapters in reading order and their
// numbers. The rules themselves (what may go where) live in Rust
// (`src-tauri/src/model/manuscript.rs`); the webview only shows the tree it receives.
import type { AreaNode } from "../api/types";
import { findNode, manuscriptOf } from "./tree";

// Shared with `lib/tree.ts` (which owns them, so the two modules never import each other).
export { isContainer, manuscriptOf } from "./tree";

function collect(nodes: AreaNode[], out: AreaNode[]) {
  for (const n of nodes) {
    if (n.kind === "chapter") out.push(n);
    collect(n.children ?? [], out);
  }
}

/** Chapters in reading order: a depth-first walk of the Manuscrito. */
export function chapterOrder(items: AreaNode[]): AreaNode[] {
  const out: AreaNode[] = [];
  const m = manuscriptOf(items);
  if (m) collect(m.children ?? [], out);
  return out;
}

/** 1-based number of chapter `id`; 0 when `id` is not a chapter. */
export function chapterNumber(items: AreaNode[], id: string): number {
  return chapterOrder(items).findIndex((c) => c.id === id) + 1;
}

/** True when `id` is the Manuscrito or sits inside it. */
export function inManuscript(items: AreaNode[], id: string): boolean {
  const m = manuscriptOf(items);
  return !!m && (m.id === id || !!findNode(m.children ?? [], id));
}

/** Chapters in a node's subtree, itself included. */
export function chapterCount(node: AreaNode): number {
  return (node.kind === "chapter" ? 1 : 0) + (node.children ?? []).reduce((a, c) => a + chapterCount(c), 0);
}

/** Saved word total of the chapters. */
export function manuscriptWords(items: AreaNode[]): number {
  return chapterOrder(items).reduce((a, c) => a + (c.words ?? 0), 0);
}

/** Title shown for a node: an untitled chapter reads "Capítulo N". */
export function displayTitle(items: AreaNode[], node: AreaNode): string {
  if (node.title.trim() || node.kind !== "chapter") return node.title;
  return "Capítulo " + chapterNumber(items, node.id);
}
