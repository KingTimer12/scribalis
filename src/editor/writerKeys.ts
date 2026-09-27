import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import type { DocJSON } from "../api/types";
import { splitAtCursor } from "./split";

export interface WriterKeysOptions {
  onSplit: (before: DocJSON, after: DocJSON) => void;
  onHint: (show: boolean) => void;
  onExitTop: () => void;
}

const MODIFIERS = ["Shift", "Control", "Alt", "Meta", "CapsLock"];

/** Enter ×3 splits the chapter, Ctrl Enter inserts a separator, ↑ at the top leaves to the title. */
export const WriterKeys = Extension.create<WriterKeysOptions>({
  name: "writerKeys",
  priority: 1000,

  addOptions() {
    return { onSplit: () => {}, onHint: () => {}, onExitTop: () => {} };
  },

  addProseMirrorPlugins() {
    const opts = this.options;
    const editor = this.editor;
    let streak = 0;
    const reset = () => {
      if (streak) opts.onHint(false);
      streak = 0;
    };

    return [
      new Plugin({
        props: {
          handleKeyDown(view, event) {
            const mod = event.ctrlKey || event.metaKey;
            if (event.key === "Enter" && mod && !event.altKey) {
              reset();
              // The trailing paragraph keeps a place to type after the separator.
              editor.chain().focus().insertContent([{ type: "separator" }, { type: "paragraph" }]).run();
              return true;
            }
            if (event.key === "Enter" && !mod && !event.altKey && !event.shiftKey) {
              const cut = streak >= 2 ? splitAtCursor(view.state) : null;
              if (cut) {
                reset();
                opts.onSplit(cut.before, cut.after);
                return true;
              }
              streak += 1;
              // The paragraph is created by the default keymap; the hint shows after the 2nd Enter.
              if (streak >= 2) queueMicrotask(() => opts.onHint(true));
              return false;
            }
            if (!MODIFIERS.includes(event.key)) reset();
            const { selection } = view.state;
            if (event.key === "ArrowUp" && !mod && !event.altKey && selection.empty && selection.from <= 1) {
              opts.onExitTop();
              return true;
            }
            return false;
          },
          handleClick() {
            reset();
            return false;
          },
        },
      }),
    ];
  },
});
