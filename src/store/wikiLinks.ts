import { createSignal } from "solid-js";
import type { AreaNode } from "../api/types";
import type { WikiLinkTarget } from "../editor/wikiLink";
import type { WikiLinkQuery } from "../editor/wikiLinkSuggest";
import { findNode } from "../lib/tree";
import { linkable, splitWikiQuery, wikiMatches } from "../lib/wikiLinks";
import { openNode } from "./actions/open";
import { state } from "./state";

// Screen state of the [[ menu in the editor: the open query and the highlighted node.

const [query, setQuery] = createSignal<WikiLinkQuery | null>(null);
const [index, setIndex] = createSignal(0);
/** Esc hides the menu for this `[[` until the caret leaves it. */
let dismissedAt: number | null = null;

export const wikiLinkQuery = query;
export const wikiLinkIndex = index;
export const setWikiLinkIndex = setIndex;

/** Nodes offered for the open query; the open document never links to itself. */
export const wikiLinkOptions = (): AreaNode[] => {
  const q = query();
  return q ? wikiMatches(state.area, splitWikiQuery(q.query).search, state.areaOpen) : [];
};

export function onWikiLinkQuery(q: WikiLinkQuery | null) {
  if (!q || q.from !== dismissedAt) dismissedAt = null;
  if (q && q.from === dismissedAt) return setQuery(null);
  if (splitWikiQuery(q?.query ?? "").search !== splitWikiQuery(query()?.query ?? "").search) setIndex(0);
  setQuery(q);
}

/** Inserts the link; the alias typed after `|` becomes its label, else it follows the title. */
export function pickWikiLink(node: AreaNode) {
  const q = query();
  q?.pick(node.id, splitWikiQuery(q.query).alias);
  setQuery(null);
}

/** Keys while a `[[` query is open; true when the menu used it. */
export function onWikiLinkKey(key: string): boolean {
  const q = query();
  const list = wikiLinkOptions();
  if (!q) return false;
  if (key === "Escape") {
    dismissedAt = q.from;
    setQuery(null);
    return true;
  }
  if (!list.length) return false;
  if (key === "ArrowDown" || key === "ArrowUp") {
    const step = key === "ArrowDown" ? 1 : -1;
    setIndex((i) => (i + step + list.length) % list.length);
    return true;
  }
  if (key === "Enter" || key === "Tab") {
    pickWikiLink(list[Math.min(index(), list.length - 1)]);
    return true;
  }
  return false;
}

/** The node a link points at, for its text in the editor. */
export function wikiLinkTarget(id: string): WikiLinkTarget | undefined {
  const node = findNode(state.area, id);
  return node && linkable(node.kind) ? { title: node.title, kind: node.kind } : undefined;
}

/** A click on a link: open its node in the main pane. */
export const openWikiLink = (id: string) => openNode(id);
