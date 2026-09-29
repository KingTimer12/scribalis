import { STATUS_LABEL } from "../../lib/constants";
import { pad } from "../../lib/format";
import { currentChapter, currentNumber } from "../../store/selectors/book";
import { StatusDot } from "../ui/StatusDot";

/** "CAPÍTULO 03 · ● RASCUNHO" label above the title; the number follows the reading order. */
export function ChapterLabel() {
  const status = () => currentChapter()?.status ?? "rascunho";
  return (
    <div class="ui chrome cap flex items-center gap-2.5">
      <span>Capítulo {pad(currentNumber())}</span>
      <span class="opacity-50">·</span>
      <StatusDot status={status()} />
      <span>{STATUS_LABEL[status()]}</span>
    </div>
  );
}
