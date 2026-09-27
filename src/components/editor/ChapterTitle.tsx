import { titleKey } from "../../store/chapters";
import { focusRef } from "../../store/focus";
import { currentChapter, updCur } from "../../store/state";
import { SrLabel } from "../ui/SrLabel";

export function ChapterTitle() {
  return (
    <>
      <SrLabel for="ch-title">Título do capítulo</SrLabel>
      <input
        id="ch-title"
        class="ed-title"
        value={currentChapter()?.title ?? ""}
        onInput={(e) => updCur({ title: e.currentTarget.value })}
        onKeyDown={titleKey}
        ref={focusRef("title")}
        placeholder="Título do capítulo"
        autocomplete="off"
      />
    </>
  );
}
