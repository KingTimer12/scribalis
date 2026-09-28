import { focusTarget } from "../../store/focus";
import { BookImage } from "./BookImage";
import { ChapterLabel } from "./ChapterLabel";
import { ChapterTitle } from "./ChapterTitle";
import { FormatBar } from "./FormatBar";
import { RichEditor } from "./RichEditor";

/** Central writing column. Clicking outside the text refocuses it. */
export function Editor() {
  return (
    <div
      class="absolute inset-x-0 top-16 bottom-16 flex justify-center"
      onClick={(e) => e.target === e.currentTarget && focusTarget("body")}
    >
      <div class="col flex h-full flex-col gap-3.5 pt-16">
        <ChapterLabel />
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
