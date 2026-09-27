import { focusTarget } from "../../store/focus";
import { ChapterBody } from "./ChapterBody";
import { ChapterLabel } from "./ChapterLabel";
import { ChapterTitle } from "./ChapterTitle";

/** Coluna central de escrita. Clique fora do texto devolve o foco a ele. */
export function Editor() {
  return (
    <div
      class="absolute inset-x-0 top-16 bottom-16 flex justify-center"
      onClick={(e) => e.target === e.currentTarget && focusTarget("body")}
    >
      <div class="col flex h-full flex-col gap-3.5 pt-16">
        <ChapterLabel />
        <ChapterTitle />
        <div class="h-[22px]" />
        <ChapterBody />
      </div>
    </div>
  );
}
