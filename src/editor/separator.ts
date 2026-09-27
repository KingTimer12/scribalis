import { Node } from "@tiptap/core";
import { createEffect, createRoot } from "solid-js";

export type SeparatorView = { kind: "text"; text: string } | { kind: "image"; src: string | null };

export interface SeparatorOptions {
  /** Reactive: the book's current separator setting. */
  view: () => SeparatorView;
}

/** Scene break. Rendered from the book settings, stored as `***`. */
export const SeparatorNode = Node.create<SeparatorOptions>({
  name: "separator",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { view: () => ({ kind: "text", text: "* * *" }) };
  },

  parseHTML() {
    return [{ tag: "div[data-separator]" }];
  },

  renderHTML() {
    return ["div", { "data-separator": "" }];
  },

  addNodeView() {
    const view = this.options.view;
    return () => {
      const dom = document.createElement("div");
      dom.className = "sep";
      dom.contentEditable = "false";
      const dispose = createRoot((d) => {
        createEffect(() => {
          const v = view();
          if (v.kind === "image" && v.src) {
            const img = document.createElement("img");
            img.src = v.src;
            img.alt = "";
            dom.replaceChildren(img);
          } else {
            dom.replaceChildren(document.createTextNode(v.kind === "text" ? v.text : "* * *"));
          }
        });
        return d;
      });
      return { dom, destroy: dispose, ignoreMutation: () => true };
    };
  },
});
