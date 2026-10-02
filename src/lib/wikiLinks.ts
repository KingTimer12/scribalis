import type { AreaNode, NodeKind } from "../api/types";
import { norm } from "./format";

/** How a link target reads in the menu and the hover card. */
export const LINK_KIND_LABEL: Partial<Record<NodeKind, string>> = {
  manuscript: "Manuscrito",
  folder: "Pasta",
  chapter: "Capítulo",
  text: "Documento",
};

/** Nodes a `[[link]]` can point at: everything with words or children, never images or attachments. */
export const linkable = (kind: NodeKind) => kind in LINK_KIND_LABEL;

/** Every linkable node of the tree, in tree order. */
export function linkTargets(items: AreaNode[], out: AreaNode[] = []): AreaNode[] {
  for (const node of items) {
    if (linkable(node.kind)) out.push(node);
    linkTargets(node.children ?? [], out);
  }
  return out;
}

/** What follows `[[`: the title being searched and, after `|`, the alias the link will show. */
export function splitWikiQuery(raw: string): { search: string; alias: string } {
  const bar = raw.indexOf("|");
  if (bar < 0) return { search: raw.trim(), alias: "" };
  return { search: raw.slice(0, bar).trim(), alias: raw.slice(bar + 1).trim() };
}

/** Linkable nodes whose title holds `search` (accents and case ignored), titles that start with it first. */
export function wikiMatches(items: AreaNode[], search: string, exclude: string | null = null, max = 8): AreaNode[] {
  const want = norm(search.trim());
  const all = linkTargets(items).filter((n) => n.id !== exclude);
  if (!want) return all.slice(0, max);
  const hits = all.filter((n) => norm(n.title).includes(want));
  const starts = (n: AreaNode) => (norm(n.title).startsWith(want) ? 0 : 1);
  // Array sort is stable: ties keep tree order.
  return [...hits].sort((a, b) => starts(a) - starts(b)).slice(0, max);
}

/** A short line about a node for the hover card: its synopsis, else the start of its notes. */
export function linkExcerpt(node: AreaNode, max = 240): string {
  const text = (node.synopsis?.trim() || node.notes.trim()).replace(/\s+/g, " ");
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
