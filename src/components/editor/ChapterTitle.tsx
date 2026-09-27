import { setChapterTitle } from "../../store/actions/chapters";
import { focusRef } from "../../store/focus";
import { titleKey } from "../../store/keys/fields";
import { currentChapter } from "../../store/selectors/book";
import { SrLabel } from "../ui/SrLabel";

export function ChapterTitle() {
  return (
    <>
      <SrLabel for="ch-title">Título do capítulo</SrLabel>
      <input
        id="ch-title"
        class="ed-title"
        value={currentChapter()?.title ?? ""}
        onInput={(e) => setChapterTitle(e.currentTarget.value)}
        onKeyDown={titleKey}
        ref={focusRef("title")}
        placeholder="Título do capítulo"
        autocomplete="off"
      />
    </>
  );
}
