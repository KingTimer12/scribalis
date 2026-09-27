import { Editor } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import TextAlign from "@tiptap/extension-text-align";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { BookImageNode } from "./image";
import { SeparatorNode, type SeparatorView } from "./separator";
import { ParagraphSpacing } from "./spacing";
import { WriterKeys, type WriterKeysOptions } from "./writerKeys";

export interface WriterEditorOptions extends WriterKeysOptions {
  element: HTMLElement;
  separator: () => SeparatorView;
  resolveImage: (src: string) => string | null;
  onChange: () => void;
}

/** The chapter editor with only the nodes and marks our markdown can store. */
export function createWriterEditor(o: WriterEditorOptions): Editor {
  return new Editor({
    element: o.element,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      UndoRedo,
      Placeholder.configure({ placeholder: "Comece a escrever…" }),
      SeparatorNode.configure({ view: o.separator }),
      BookImageNode.configure({ resolve: o.resolveImage }),
      WriterKeys.configure({ onSplit: o.onSplit, onHint: o.onHint, onExitTop: o.onExitTop }),
      Bold,
      Italic,
      TextAlign.configure({ types: ["paragraph"], alignments: ["left", "center", "right", "justify"] }),
      ParagraphSpacing,
    ],
    editorProps: { attributes: { class: "ed-body", id: "ch-body", "aria-label": "Texto do capítulo" } },
    onUpdate: () => o.onChange(),
  });
}
