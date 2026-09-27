import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { BookImageNode } from "./image";
import { SeparatorNode, type SeparatorView } from "./separator";
import { WriterKeys, type WriterKeysOptions } from "./writerKeys";

export interface WriterEditorOptions extends WriterKeysOptions {
  element: HTMLElement;
  separator: () => SeparatorView;
  resolveImage: (src: string) => string | null;
  onChange: () => void;
}

/** The chapter editor with only the nodes our markdown can store. */
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
    ],
    editorProps: { attributes: { class: "ed-body", id: "ch-body", "aria-label": "Texto do capítulo" } },
    onUpdate: () => o.onChange(),
  });
}
