import { Editor } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import type { DocJSON } from "../api/types";
import { BookImageNode } from "./image";
import { MentionNode, type MentionOptions } from "./mention";
import { MentionSuggest, type MentionSuggestOptions } from "./mentionSuggest";
import { SeparatorNode, type SeparatorView } from "./separator";
import { ParagraphSpacing } from "./spacing";
import { WikiLinkNode, type WikiLinkOptions } from "./wikiLink";
import { WikiLinkSuggest, type WikiLinkSuggestOptions } from "./wikiLinkSuggest";
import { WriterKeys, type WriterKeysOptions } from "./writerKeys";

export interface WriterEditorOptions extends Omit<WriterKeysOptions, "onSplit" | "separatorKey"> {
  element: HTMLElement;
  separator: () => SeparatorView;
  resolveImage: (src: string) => string | null;
  onChange: () => void;
  onFormat: (editor: Editor) => void;
  /** Absent disables Enter x3: the 3rd Enter becomes a plain Enter, with no streak or hint. */
  onSplit?: (before: DocJSON, after: DocJSON) => void;
  /** False: Ctrl Enter inserts no separator (free texts). Defaults to true. */
  separatorKey?: boolean;
  /** Sheet mentions: how to show them and the @ menu. Absent in tests: mentions show their label. */
  mentions?: MentionOptions & MentionSuggestOptions;
  /** `[[links]]` to tree nodes: how to show and open them and the [[ menu. Absent in tests: links show their label. */
  wikiLinks?: WikiLinkOptions & WikiLinkSuggestOptions;
  ariaLabel: string;
  placeholder: string;
}

/** The reusable writer editor: chapters and workspace ("area") texts alike, with only the nodes and marks our markdown can store. */
export function createWriterEditor(o: WriterEditorOptions): Editor {
  return new Editor({
    element: o.element,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({ placeholder: o.placeholder }),
      SeparatorNode.configure({ view: o.separator }),
      BookImageNode.configure({ resolve: o.resolveImage }),
      MentionNode.configure({ lookup: o.mentions?.lookup ?? (() => undefined) }),
      MentionSuggest.configure({ onQuery: o.mentions?.onQuery ?? (() => {}), onKey: o.mentions?.onKey ?? (() => false) }),
      WikiLinkNode.configure({ lookup: o.wikiLinks?.lookup ?? (() => undefined), open: o.wikiLinks?.open ?? (() => {}) }),
      WikiLinkSuggest.configure({ onQuery: o.wikiLinks?.onQuery ?? (() => {}), onKey: o.wikiLinks?.onKey ?? (() => false) }),
      WriterKeys.configure({ onSplit: o.onSplit ?? null, separatorKey: o.separatorKey ?? true, onHint: o.onHint, onExitTop: o.onExitTop }),
      Bold,
      Italic,
      TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right", "justify"] }),
      ParagraphSpacing,
    ],
    // A single editor is ever mounted at a time, so the DOM id stays fixed regardless of scope.
    editorProps: { attributes: { class: "ed-body", id: "ch-body", "aria-label": o.ariaLabel } },
    onUpdate: () => o.onChange(),
    onTransaction: ({ editor }) => o.onFormat(editor),
  });
}
