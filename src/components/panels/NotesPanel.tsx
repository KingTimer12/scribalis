import { pad } from "../../lib/format";
import { focusRef } from "../../store/focus";
import { currentBook, currentChapter, updCur } from "../../store/state";
import { Hint } from "../ui/Hint";
import { SrLabel } from "../ui/SrLabel";

/** Notas do capítulo atual (Ctrl ;). */
export function NotesPanel() {
  return (
    <div class="notes">
      <div class="ui cap">Notas · Capítulo {pad((currentBook()?.cur ?? 0) + 1)}</div>
      <SrLabel for="ch-notes">Notas do capítulo</SrLabel>
      <textarea
        id="ch-notes"
        class="notes-ta"
        value={currentChapter()?.notes ?? ""}
        onInput={(e) => updCur({ notes: e.currentTarget.value })}
        ref={focusRef("notes")}
        placeholder="Ideias, pendências, lembretes de continuidade…"
      />
      <Hint keys="Esc">voltar ao texto</Hint>
    </div>
  );
}
