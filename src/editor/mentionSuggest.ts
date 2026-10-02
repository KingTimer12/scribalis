import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** What follows a typed `@`, and where it sits, for the mention menu. */
export interface MentionQuery {
  /** Position of the `@`. */
  from: number;
  /** The caret. */
  to: number;
  query: string;
  /** Screen box of the `@`, to place the menu under it. */
  left: number;
  bottom: number;
  /** Swaps `@query` for a mention of the sheet and a space. */
  pick: (id: string, label: string) => void;
}

export interface MentionSuggestOptions {
  onQuery: (q: MentionQuery | null) => void;
  /** Keys while a query is open; true when the menu used it. */
  onKey: (key: string) => boolean;
}

/** `@` at the start of the text or after a space, then up to 30 characters (names have spaces). */
const TRIGGER = /(?:^|\s)@([^@\n￼]{0,30})$/;

/** The `@query` right before the caret, if any. */
export function findQuery(view: EditorView): { from: number; to: number; query: string } | null {
  const sel = view.state.selection;
  if (!sel.empty) return null;
  const $from = sel.$from;
  if (!$from.parent.isTextblock) return null;
  const start = Math.max(0, $from.parentOffset - 40);
  const before = $from.parent.textBetween(start, $from.parentOffset, undefined, "￼");
  const m = TRIGGER.exec(before);
  if (!m) return null;
  const query = m[1];
  return { from: $from.pos - query.length - 1, to: $from.pos, query };
}

/** Watches the text before the caret for `@` and hands the query to the mention menu. */
export const MentionSuggest = Extension.create<MentionSuggestOptions>({
  name: "mentionSuggest",
  // Before the writer keys: Enter picks a sheet instead of splitting the paragraph.
  priority: 1000,

  addOptions() {
    return { onQuery: () => {}, onKey: () => false };
  },

  addProseMirrorPlugins() {
    const { onQuery, onKey } = this.options;
    const editor = this.editor;
    let open = false;
    const report = (view: EditorView) => {
      const q = view.hasFocus() || open ? findQuery(view) : null;
      open = !!q;
      if (!q) return onQuery(null);
      const box = view.coordsAtPos(q.from);
      onQuery({
        ...q,
        left: box.left,
        bottom: box.bottom,
        pick: (id, label) =>
          editor
            .chain()
            .focus()
            .insertContentAt({ from: q.from, to: q.to }, [
              { type: "mention", attrs: { id, label } },
              { type: "text", text: " " },
            ])
            .run(),
      });
    };
    return [
      new Plugin({
        key: new PluginKey("mentionSuggest"),
        view: (view) => {
          report(view);
          return { update: report, destroy: () => onQuery(null) };
        },
        props: {
          handleKeyDown: (_view, e) => {
            if (!open || !onKey(e.key)) return false;
            // The window shortcuts (Esc closing focus mode) must not see a key the menu used.
            e.stopPropagation();
            return true;
          },
          handleDOMEvents: {
            blur: () => {
              open = false;
              onQuery(null);
              return false;
            },
          },
        },
      }),
    ];
  },
});
