import { Show } from "solid-js";
import { pad } from "../../lib/format";
import { setChapterNotes } from "../../store/actions/chapters";
import { fetchComments } from "../../store/actions/cloud";
import { focusRef } from "../../store/focus";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { SrLabel } from "../ui/SrLabel";

/** Notes for the current chapter (Ctrl ;), in a drawer on the right. */
export function NotesPanel() {
  return (
    <>
      <Scrim />
      <div class="drawer right">
        <div class="ui cap">Notas · Capítulo {pad((state.book?.cur ?? 0) + 1)}</div>
        <SrLabel for="ch-notes">Notas do capítulo</SrLabel>
        <textarea
          id="ch-notes"
          class="notes-ta"
          value={currentChapter()?.notes ?? ""}
          onInput={(e) => setChapterNotes(e.currentTarget.value)}
          ref={focusRef("notes")}
          placeholder="Ideias, pendências, lembretes de continuidade…"
        />
        <div class="drawer-foot">
          <Hint keys="Esc">voltar ao texto</Hint>
          <Show when={state.cloudBook?.enabled}>
            <button class="ui crumb" onClick={() => void fetchComments(false)}>
              Buscar comentários
            </button>
          </Show>
        </div>
      </div>
    </>
  );
}
