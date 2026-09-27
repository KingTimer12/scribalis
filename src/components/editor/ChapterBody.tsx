import { bodyKey, onBodyInput, resetEnterStreak } from "../../store/chapters";
import { focusRef } from "../../store/focus";
import { currentChapter } from "../../store/state";
import { SrLabel } from "../ui/SrLabel";

export function ChapterBody() {
  return (
    <>
      <SrLabel for="ch-body">Texto do capítulo</SrLabel>
      <textarea
        id="ch-body"
        class="ed-body"
        value={currentChapter()?.body ?? ""}
        onInput={(e) => onBodyInput(e.currentTarget)}
        onKeyDown={bodyKey}
        onClick={resetEnterStreak}
        ref={focusRef("body")}
        placeholder="Comece a escrever…"
      />
    </>
  );
}
