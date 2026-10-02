import type { AreaNode } from "../../api/types";
import { manuscriptOf } from "../../lib/manuscript";
import { ancestors } from "../../lib/tree";
import { setState, state } from "../state";

const storageKey = (bookId: string) => "area-expanded:" + bookId;

/** Folders remembered as expanded for this book; null when nothing was saved. Never throws. */
function load(bookId: string): string[] | null {
  try {
    const raw = localStorage.getItem(storageKey(bookId));
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function save(bookId: string, expanded: string[]) {
  setState("areaExpanded", expanded);
  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(expanded));
  } catch {
    // ignore: nothing worth surfacing to the user over a remembered UI preference
  }
}

/** Expanded folders when a book opens: the remembered ones (the Manuscrito the first time), plus the path to `openId`. */
export function expandedFor(bookId: string, items: AreaNode[], openId: string | null): string[] {
  const m = manuscriptOf(items);
  // The first time, the Manuscrito shows open even when it sits inside folders.
  const base = load(bookId) ?? (m ? [...ancestors(items, m.id), m.id] : []);
  return [...new Set([...base, ...ancestors(items, openId)])];
}

export function toggleExpanded(id: string) {
  const b = state.book;
  if (!b) return;
  const set = new Set(state.areaExpanded);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  save(b.id, [...set]);
}

/** Expands the folders around `id` (and `id` itself with `self`), so its row or its content shows. */
export function reveal(id: string, self = false) {
  const b = state.book;
  if (!b) return;
  const want = [...ancestors(state.area, id), ...(self ? [id] : [])];
  if (want.every((x) => state.areaExpanded.includes(x))) return;
  save(b.id, [...new Set([...state.areaExpanded, ...want])]);
}

/** Opens folder `id` and the folders around it. */
export const expand = (id: string) => reveal(id, true);
