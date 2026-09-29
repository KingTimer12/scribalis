import { Show } from "solid-js";
import { ago, pad } from "../../lib/format";
import { setChapterNotes } from "../../store/actions/chapters";
import { fetchComments } from "../../store/actions/cloud";
import { setNodeNotes } from "../../store/actions/workspace";
import { focusRef } from "../../store/focus";
import { currentNumber } from "../../store/selectors/book";
import { openAreaNode } from "../../store/selectors/workspace";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { SrLabel } from "../ui/SrLabel";

/** Notes of the open chapter or text (Ctrl ;), in a drawer on the right. */
export function NotesPanel() {
  const node = () => openAreaNode();
  const chapter = () => node()?.kind === "chapter";
  const label = () => (chapter() ? "Capítulo " + pad(currentNumber()) : node()?.title || "Documento");
  return (
    <>
      <Scrim />
      <div class="drawer right">
        <div class="ui cap">Notas · {label()}</div>
        <SrLabel for="ch-notes">Notas</SrLabel>
        <textarea
          id="ch-notes"
          class="notes-ta"
          value={node()?.notes ?? ""}
          // Chapter notes save debounced while typing; a text's notes save when the field changes.
          onInput={(e) => chapter() && setChapterNotes(e.currentTarget.value)}
          onChange={(e) => {
            const n = node();
            if (n && !chapter()) void setNodeNotes(n.id, e.currentTarget.value);
          }}
          ref={focusRef("notes")}
          placeholder="Ideias, pendências, lembretes de continuidade…"
        />
        <div class="drawer-foot">
          <Hint keys="Esc">voltar ao texto</Hint>
          <Show when={state.cloudBook?.enabled}>
            <button class="ui crumb" onClick={() => void fetchComments(false)}>
              Buscar comentários
            </button>
            <Show when={state.cloudBook?.lastCommentsAt}>
              <span class="ui crumb">{ago(state.cloudBook!.lastCommentsAt!)}</span>
            </Show>
          </Show>
        </div>
      </div>
    </>
  );
}
