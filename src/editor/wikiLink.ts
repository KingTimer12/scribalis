import { Node } from "@tiptap/core";
import { createEffect, createRoot } from "solid-js";
import type { NodeKind } from "../api/types";

export interface WikiLinkTarget {
  title: string;
  kind: NodeKind;
}

export interface WikiLinkOptions {
  /** Reactive: the tree node a link points at, or undefined when it is gone. */
  lookup: (id: string) => WikiLinkTarget | undefined;
  /** A click on the link opens its node. */
  open: (id: string) => void;
}

/** What the link shows: its alias, else the node's current title, else (node gone) a placeholder. */
export function wikiLinkText(label: string, target: WikiLinkTarget | undefined): string {
  return label || target?.title.trim() || "?";
}

/**
 * Obsidian-style `[[Title]]` pointing at a tree node, stored as `[[alias]](id)`. An empty alias
 * follows the node's title as it is renamed; a deleted node leaves the link struck through.
 */
export const WikiLinkNode = Node.create<WikiLinkOptions>({
  name: "wikiLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addOptions() {
    return { lookup: () => undefined, open: () => {} };
  },

  addAttributes() {
    return {
      id: { default: "" },
      label: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-wikilink]",
        getAttrs: (el) => ({ id: el.getAttribute("data-wikilink") ?? "", label: el.getAttribute("data-label") ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    return ["span", { "data-wikilink": node.attrs.id, "data-label": node.attrs.label, class: "wikilink" }, node.attrs.label];
  },

  renderText({ node }) {
    return node.attrs.label;
  },

  addNodeView() {
    const { lookup, open } = this.options;
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "wikilink";
      dom.contentEditable = "false";
      dom.dataset.id = node.attrs.id;
      dom.addEventListener("click", (e) => {
        e.preventDefault();
        if (lookup(node.attrs.id)) open(node.attrs.id);
      });
      const dispose = createRoot((d) => {
        createEffect(() => {
          const target = lookup(node.attrs.id);
          dom.textContent = wikiLinkText(node.attrs.label, target);
          dom.dataset.kind = target?.kind ?? "";
          dom.classList.toggle("gone", !target);
        });
        return d;
      });
      return { dom, destroy: dispose, ignoreMutation: () => true };
    };
  },
});
