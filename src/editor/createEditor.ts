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
import { SeparatorNode, type SeparatorView } from "./separator";
import { ParagraphSpacing } from "./spacing";
import { WriterKeys, type WriterKeysOptions } from "./writerKeys";

export interface WriterEditorOptions extends Omit<WriterKeysOptions, "onSplit"> {
  element: HTMLElement;
  separator: () => SeparatorView;
  resolveImage: (src: string) => string | null;
  onChange: () => void;
  onFormat: (editor: Editor) => void;
  /** Absent disables Enter x3: the 3rd Enter becomes a plain Enter, with no streak or hint. */
  onSplit?: (before: DocJSON, after: DocJSON) => void;
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
      WriterKeys.configure({ onSplit: o.onSplit ?? null, onHint: o.onHint, onExitTop: o.onExitTop }),
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
