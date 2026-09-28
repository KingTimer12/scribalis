import type { ScanItem, ScanView } from "../api/types";

/** Which binder items may be marked "virar capítulos": folders, and texts that have children. */
export function canBeChapters(item: ScanItem): boolean {
  if (item.kind === "draft" || item.kind === "research" || item.kind === "folder") return true;
  return item.kind === "text" && item.children.length > 0;
}

const isMedia = (item: ScanItem) => item.kind === "image" || item.kind === "file";

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

/** The manuscript folder(s) start marked. */
export function defaultChosen(view: ScanView): string[] {
  const out: string[] = [];
  const walk = (items: ScanItem[]) => {
    for (const item of items) {
      if (item.kind === "draft") out.push(item.key);
      else walk(item.children);
    }
  };
  walk(view.items);
  return out;
}

/** True when an ancestor of `key` is marked: its checkbox shows marked and disabled. */
export function coveredBy(view: ScanView, chosen: string[], key: string): boolean {
  const path = ancestors(view.items, key) ?? [];
  return path.some((k) => chosen.includes(k));
}

/** Flips `key`; marking a folder drops its marked descendants (they are covered by it). */
export function toggleChosen(view: ScanView, chosen: string[], key: string): string[] {
  if (chosen.includes(key)) return chosen.filter((k) => k !== key);
  const item = find(view.items, key);
  if (!item || !canBeChapters(item) || coveredBy(view, chosen, key)) return chosen;
  const inside = descendantKeys(item);
  return [...chosen.filter((k) => !inside.has(k)), key];
}

/** Chapters the import will create: the direct non-media children of every marked folder. */
export function countChapters(view: ScanView, chosen: string[]): number {
  let n = 0;
  for (const key of chosen) {
    const item = find(view.items, key);
    if (item) n += item.children.filter((c) => !isMedia(c)).length;
  }
  return n;
}
