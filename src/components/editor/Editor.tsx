import { focusTarget } from "../../store/focus";
import { BookImage } from "./BookImage";
import { ChapterBar } from "./ChapterBar";
import { ChapterTitle } from "./ChapterTitle";
import { FormatBar } from "./FormatBar";
import { RichEditor } from "./RichEditor";

/** The chapter's writing column (moldura, título, texto). Clicking outside the text refocuses it. */
export function Editor() {
  return (
    <div
      class="flex h-full w-full justify-center"
      onClick={(e) => e.target === e.currentTarget && focusTarget("body")}
    >
      <div class="col flex h-full flex-col gap-3.5 pt-16">
        <ChapterBar />
        <FormatBar />
        <div class="ed-scroll" onClick={(e) => e.target === e.currentTarget && focusTarget("body", "end")}>
          <ChapterTitle />
          <BookImage slot="header" />
          <div class="h-[22px] shrink-0" />
          <RichEditor scope="chapter" />
          <BookImage slot="footer" />
        </div>
      </div>
    </div>
  );
}
