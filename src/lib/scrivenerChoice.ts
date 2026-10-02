import type { ScanItem, ScanView } from "../api/types";

/**
 * Which binder items may be marked as a chapter: texts and folders. A marked item becomes
 * one chapter holding its text and its descendants'. Media carries no text, and the
 * manuscript/research roots are too broad to be a single chapter.
 */
export function canBeChapter(item: ScanItem): boolean {
  return item.kind === "text" || item.kind === "folder";
}

function find(items: ScanItem[], key: string): ScanItem | null {
  for (const item of items) {
    if (item.key === key) return item;
    const found = find(item.children, key);
    if (found) return found;
  }
  return null;
}

/** Keys of the ancestors of `key`, root first; null when `key` is not in the tree. */
function ancestors(items: ScanItem[], key: string, path: string[] = []): string[] | null {
  for (const item of items) {
    if (item.key === key) return path;
    const found = ancestors(item.children, key, [...path, item.key]);
    if (found) return found;
  }
  return null;
}

function descendantKeys(item: ScanItem, out = new Set<string>()): Set<string> {
  for (const child of item.children) {
    out.add(child.key);
    descendantKeys(child, out);
  }
  return out;
}

/** Starts with each direct child of the manuscript marked, the usual chapter layout. */
export function defaultChosen(view: ScanView): string[] {
  const out: string[] = [];
  const walk = (items: ScanItem[]) => {
    for (const item of items) {
      if (item.kind === "draft") out.push(...item.children.filter(canBeChapter).map((c) => c.key));
      else walk(item.children);
    }
  };
  walk(view.items);
  return out;
}

/** True when an ancestor of `key` is marked: it goes inside that chapter, so its box shows marked and disabled. */
export function coveredBy(view: ScanView, chosen: string[], key: string): boolean {
  const path = ancestors(view.items, key) ?? [];
  return path.some((k) => chosen.includes(k));
}

/** Flips `key`; marking an item drops its marked descendants (they join its chapter). */
export function toggleChosen(view: ScanView, chosen: string[], key: string): string[] {
  if (chosen.includes(key)) return chosen.filter((k) => k !== key);
  const item = find(view.items, key);
  if (!item || !canBeChapter(item) || coveredBy(view, chosen, key)) return chosen;
  const inside = descendantKeys(item);
  return [...chosen.filter((k) => !inside.has(k)), key];
}

/** The direct children of `key` that could be marked as chapters. */
export function eligibleChildren(view: ScanView, key: string): ScanItem[] {
  return find(view.items, key)?.children.filter(canBeChapter) ?? [];
}

/** True when every eligible direct child of `key` is marked. */
export function allChildrenChosen(view: ScanView, chosen: string[], key: string): boolean {
  const kids = eligibleChildren(view, key);
  return kids.length > 0 && kids.every((c) => chosen.includes(c.key));
}

/** Marks every eligible direct child of `key` as a chapter, or unmarks them all when they already are. */
export function toggleChildren(view: ScanView, chosen: string[], key: string): string[] {
  const kids = eligibleChildren(view, key);
  if (!kids.length || chosen.includes(key) || coveredBy(view, chosen, key)) return chosen;
  if (allChildrenChosen(view, chosen, key)) {
    const drop = new Set(kids.map((c) => c.key));
    return chosen.filter((k) => !drop.has(k));
  }
  let out = chosen;
  for (const c of kids) if (!out.includes(c.key)) out = toggleChosen(view, out, c.key);
  return out;
}

/** Chapters the import will create: one per marked item. */
export function countChapters(view: ScanView, chosen: string[]): number {
  return chosen.filter((k) => {
    const item = find(view.items, k);
    return !!item && canBeChapter(item);
  }).length;
}

function parentOf(items: ScanItem[], key: string): ScanItem | null {
  for (const item of items) {
    if (item.children.some((c) => c.key === key)) return item;
    const found = parentOf(item.children, key);
    if (found) return found;
  }
  return null;
}

/**
 * The folder marked as the chapter folder (mirrors Rust's `chapter_folder`): every marked item
 * is one of its direct children, and all of them are marked. A new book keeps it where it is,
 * with its name, as the Manuscrito.
 */
export function chapterFolder(view: ScanView, chosen: string[]): ScanItem | null {
  if (!chosen.length) return null;
  const folder = parentOf(view.items, chosen[0]);
  if (!folder || !["draft", "folder", "research"].includes(folder.kind)) return null;
  const eligible = folder.children.filter((c) => c.kind !== "image" && c.kind !== "file").map((c) => c.key);
  const all = eligible.every((k) => chosen.includes(k));
  const only = chosen.every((k) => eligible.includes(k));
  return all && only ? folder : null;
}
