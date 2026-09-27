import { onCleanup, onMount } from "solid-js";
import { setEditor, focusEditor } from "../../editor/bridge";
import { createWriterEditor } from "../../editor/createEditor";
import type { SeparatorView } from "../../editor/separator";
import { bookAsset } from "../../lib/assets";
import { onEditorChange, splitCurrent } from "../../store/actions/chapters";
import { focusHandler, focusTarget } from "../../store/focus";
import { setState, state } from "../../store/state";

/** Chapter text (TipTap). The document lives only here, never in the store. */
export function RichEditor() {
  let host!: HTMLDivElement;

  const separator = (): SeparatorView => {
    const b = state.book;
    const s = b?.separator;
    if (!b || !s || s.type === "text") return { kind: "text", text: s?.type === "text" ? s.text : "* * *" };
    return { kind: "image", src: bookAsset(b.dir, s.image, b.updatedAt) };
  };
  const resolveImage = (src: string) => (state.book ? bookAsset(state.book.dir, src, 0) : null);

  onMount(() => {
    const editor = createWriterEditor({
      element: host,
      separator,
      resolveImage,
      onChange: onEditorChange,
      onSplit: splitCurrent,
      onHint: (show) => setState("tripleHint", show && !state.toast),
      onExitTop: () => focusTarget("title", "end"),
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
