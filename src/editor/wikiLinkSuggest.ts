import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/** What follows a typed `[[`, and where it sits, for the link menu. */
export interface WikiLinkQuery {
  /** Position of the first `[`. */
  from: number;
  /** The caret. */
  to: number;
  /** Raw text after `[[`, `title|alias` included. */
  query: string;
  /** Screen box of the `[[`, to place the menu under it. */
  left: number;
  bottom: number;
  /** Swaps `[[query` for a link to the node and a space. */
  pick: (id: string, label: string) => void;
}

export interface WikiLinkSuggestOptions {
  onQuery: (q: WikiLinkQuery | null) => void;
  /** Keys while a query is open; true when the menu used it. */
  onKey: (key: string) => boolean;
}

/** `[[` then up to 80 characters with no bracket or line break: a title, maybe `|alias`. */
const TRIGGER = /\[\[([^[\]\n￼]{0,80})$/;

/** The `[[query` right before the caret, if any. */
export function findWikiQuery(view: EditorView): { from: number; to: number; query: string } | null {
  const sel = view.state.selection;
  if (!sel.empty) return null;
  const $from = sel.$from;
  if (!$from.parent.isTextblock) return null;
  const start = Math.max(0, $from.parentOffset - 90);
  const before = $from.parent.textBetween(start, $from.parentOffset, undefined, "￼");
  const m = TRIGGER.exec(before);
  if (!m) return null;
  const query = m[1];
  return { from: $from.pos - query.length - 2, to: $from.pos, query };
}

/** Watches the text before the caret for `[[` and hands the query to the link menu. */
export const WikiLinkSuggest = Extension.create<WikiLinkSuggestOptions>({
  name: "wikiLinkSuggest",
  // Before the writer keys: Enter picks a node instead of splitting the paragraph.
  priority: 1000,

  addOptions() {
    return { onQuery: () => {}, onKey: () => false };
  },

  addProseMirrorPlugins() {
    const { onQuery, onKey } = this.options;
    const editor = this.editor;
    let open = false;
    const report = (view: EditorView) => {
      const q = view.hasFocus() || open ? findWikiQuery(view) : null;
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
              { type: "wikiLink", attrs: { id, label } },
              { type: "text", text: " " },
            ])
            .run(),
      });
    };
    return [
      new Plugin({
        key: new PluginKey("wikiLinkSuggest"),
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
