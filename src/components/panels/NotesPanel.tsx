import { pad } from "../../lib/format";
import { setChapterNotes } from "../../store/actions/chapters";
import { focusRef } from "../../store/focus";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { SrLabel } from "../ui/SrLabel";

/** Notes for the current chapter (Ctrl ;). */
export function NotesPanel() {
  return (
    <div class="notes">
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
      <Hint keys="Esc">voltar ao texto</Hint>
    </div>
  );
}
