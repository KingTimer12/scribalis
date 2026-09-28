import { onCleanup, onMount } from "solid-js";
import { setEditor, focusEditor } from "../../editor/bridge";
import { createWriterEditor } from "../../editor/createEditor";
import { readFormat, setFormatState } from "../../editor/format";
import type { SeparatorView } from "../../editor/separator";
import { bookAsset } from "../../lib/assets";
import { onEditorChange, splitCurrent } from "../../store/actions/chapters";
import { focusHandler, focusTarget } from "../../store/focus";
import { scheduleDocSave } from "../../store/saving";
import { setState, state } from "../../store/state";

export interface RichEditorProps {
  /** "chapter" keeps the book-writing behavior (Enter x3 split, hint, word counts); "area" is a plain workspace text. */
  scope: "chapter" | "area";
}

/** Reusable text editor (TipTap). The document lives only here, never in the store. */
export function RichEditor(props: RichEditorProps) {
  let host!: HTMLDivElement;

  const separator = (): SeparatorView => {
    const b = state.book;
    const s = b?.separator;
    if (!b || !s || s.type === "text") return { kind: "text", text: s?.type === "text" ? s.text : "* * *" };
    return { kind: "image", src: bookAsset(b.dir, s.image, b.updatedAt) };
  };
  const resolveImage = (src: string) => (state.book ? bookAsset(state.book.dir, src, 0) : null);

  onMount(() => {
    const editor =
      props.scope === "chapter"
        ? createWriterEditor({
            element: host,
            separator,
            resolveImage,
            onChange: onEditorChange,
            onFormat: (ed) => setFormatState(readFormat(ed)),
            onSplit: splitCurrent,
            onHint: (show) => setState("tripleHint", show && !state.toast),
            onExitTop: () => focusTarget("title", "end"),
            ariaLabel: "Texto do capítulo",
            placeholder: "Comece a escrever…",
          })
        : createWriterEditor({
            element: host,
            separator,
            resolveImage,
            onChange: scheduleDocSave,
            onFormat: (ed) => setFormatState(readFormat(ed)),
            onHint: () => {},
            onExitTop: () => {},
            ariaLabel: "Texto do documento",
            placeholder: "Escreva aqui…",
          });
    setEditor(editor);
    focusHandler("body", focusEditor);
    onCleanup(() => {
      setEditor(null);
      editor.destroy();
    });
  });

  return <div ref={host} class="ed-host" />;
}
