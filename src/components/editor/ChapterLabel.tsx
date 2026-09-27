import { STATUS_LABEL } from "../../lib/constants";
import { pad } from "../../lib/format";
import { currentBook, currentChapter } from "../../store/state";
import { StatusDot } from "../ui/StatusDot";

/** "CAPÍTULO 03 · ● RASCUNHO" label above the title. */
export function ChapterLabel() {
  const status = () => currentChapter()?.status ?? "rascunho";
  return (
    <div class="ui chrome cap flex items-center gap-2.5">
      <span>Capítulo {pad((currentBook()?.cur ?? 0) + 1)}</span>
      <span class="opacity-50">·</span>
      <StatusDot status={status()} />
      <span>{STATUS_LABEL[status()]}</span>
    </div>
  );
}
