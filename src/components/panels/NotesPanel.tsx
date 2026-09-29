import { onCleanup, Show } from "solid-js";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { ago, pad } from "../../lib/format";
import { setChapterNotes } from "../../store/actions/chapters";
import { fetchComments } from "../../store/actions/cloud";
import { flushSynopsis, scheduleSynopsis } from "../../store/actions/synopsis";
import { flushNodeNotes, scheduleNodeNotes } from "../../store/actions/workspace";
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
  // Closing the drawer unmounts the fields before a `change` event: land pending text here.
  onCleanup(() => {
    void flushNodeNotes();
    void flushSynopsis();
  });
  return (
    <>
      <Scrim />
      <div class="drawer right">
        <div class="ui cap">Notas · {label()}</div>
        <label class="ui cap" for="ch-synopsis">
          Sinopse
        </label>
        <textarea
          id="ch-synopsis"
          class="notes-ta syn-ta"
          value={node()?.synopsis ?? ""}
          maxlength={SYNOPSIS_MAX}
          // Same field as the index card: saved debounced, landed on blur and on close.
          onInput={(e) => {
            const n = node();
            if (n) scheduleSynopsis(n.id, e.currentTarget.value);
          }}
          onBlur={() => void flushSynopsis()}
          placeholder="Escreva uma sinopse…"
        />
        <SrLabel for="ch-notes">Notas</SrLabel>
        <textarea
          id="ch-notes"
          class="notes-ta"
          value={node()?.notes ?? ""}
          // Both kinds save debounced while typing; closing the drawer flushes a pending save.
          onInput={(e) => {
            const n = node();
            if (!n) return;
            if (chapter()) setChapterNotes(e.currentTarget.value);
            else scheduleNodeNotes(n.id, e.currentTarget.value);
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
