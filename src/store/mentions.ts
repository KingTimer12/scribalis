import { createSignal } from "solid-js";
import type { Sheet } from "../api/types";
import type { MentionTarget } from "../editor/mention";
import type { MentionQuery } from "../editor/mentionSuggest";
import { mentionMatches } from "../lib/sheets";
import { state } from "./state";

// Screen state of the @ menu in the editor: the open query and the highlighted sheet.

const [query, setQuery] = createSignal<MentionQuery | null>(null);
const [index, setIndex] = createSignal(0);
/** Esc hides the menu for this `@` until the caret leaves it. */
let dismissedAt: number | null = null;

export const mentionQuery = query;
export const mentionIndex = index;
export const setMentionIndex = setIndex;

/** Sheets offered for the open query. */
export const mentionOptions = (): Sheet[] => {
  const q = query();
  return q ? mentionMatches(state.sheets, q.query) : [];
};

export function onMentionQuery(q: MentionQuery | null) {
  if (!q || q.from !== dismissedAt) dismissedAt = null;
  if (q && q.from === dismissedAt) return setQuery(null);
  if (q?.query !== query()?.query) setIndex(0);
  setQuery(q);
}

export function pickMention(sheet: Sheet) {
  query()?.pick(sheet.id, sheet.name.trim());
  setQuery(null);
}

/** Keys while an `@` query is open; true when the menu used it. */
export function onMentionKey(key: string): boolean {
  const q = query();
  const list = mentionOptions();
  if (!q || !list.length) return false;
  if (key === "ArrowDown" || key === "ArrowUp") {
    const step = key === "ArrowDown" ? 1 : -1;
    setIndex((i) => (i + step + list.length) % list.length);
    return true;
  }
  if (key === "Enter" || key === "Tab") {
    pickMention(list[Math.min(index(), list.length - 1)]);
    return true;
  }
  if (key === "Escape") {
    dismissedAt = q.from;
    setQuery(null);
    return true;
  }
  return false;
}

/** The sheet a mention points at, for its label in the editor. */
export function mentionTarget(id: string): MentionTarget | undefined {
  const s = state.sheets?.sheets.find((x) => x.id === id);
  return s ? { name: s.name.trim(), kind: s.kind } : undefined;
}
