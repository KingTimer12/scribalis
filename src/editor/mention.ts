import { Node } from "@tiptap/core";
import { createEffect, createRoot } from "solid-js";
import type { SheetKind } from "../api/types";

export interface MentionTarget {
  name: string;
  kind: SheetKind;
}

export interface MentionOptions {
  /** Reactive: the sheet a mention points at, or undefined when it is gone. */
  lookup: (id: string) => MentionTarget | undefined;
}

/**
 * `@Name` pointing at a sheet, stored as `@[Name](id)`. It shows the sheet's current name; the
 * stored label is the name when it was written, kept for a deleted sheet and for plain text.
 */
export const MentionNode = Node.create<MentionOptions>({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,

  addOptions() {
    return { lookup: () => undefined };
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
        tag: "span[data-mention]",
        getAttrs: (el) => ({ id: el.getAttribute("data-mention") ?? "", label: el.getAttribute("data-label") ?? "" }),
      },
    ];
  },

  renderHTML({ node }) {
    return ["span", { "data-mention": node.attrs.id, "data-label": node.attrs.label, class: "mention" }, "@" + node.attrs.label];
  },

  renderText({ node }) {
    return "@" + node.attrs.label;
  },

  addNodeView() {
    const lookup = this.options.lookup;
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.className = "mention";
      dom.contentEditable = "false";
      dom.dataset.id = node.attrs.id;
      const dispose = createRoot((d) => {
        createEffect(() => {
          const target = lookup(node.attrs.id);
          dom.textContent = "@" + (target?.name || node.attrs.label || "?");
          dom.dataset.kind = target?.kind ?? "";
          dom.classList.toggle("gone", !target);
        });
        return d;
      });
      return { dom, destroy: dispose, ignoreMutation: () => true };
    };
  },
});
