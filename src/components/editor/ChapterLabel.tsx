import { pad } from "../../lib/format";
import { currentNumber } from "../../store/selectors/book";

/** "CAPÍTULO 03": the chapter's reading-order number. Status now has its own clickable button in ChapterBar. */
export function ChapterLabel() {
  return <span class="ui cap">Capítulo {pad(currentNumber())}</span>;
}
