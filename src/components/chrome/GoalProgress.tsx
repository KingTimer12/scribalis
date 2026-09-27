import { allWords, fmt } from "../../lib/format";
import { session, state } from "../../store/state";

/** Daily goal: words written this session across all books. */
export function GoalProgress() {
  const today = () => Math.max(0, allWords(state.books) - session.baseWords);
  const pct = () => Math.min(100, Math.round((today() / state.prefs.goal) * 100));
  return (
    <>
      <span>
        {fmt(today())} de {fmt(state.prefs.goal)} hoje
      </span>
      <div class="h-[3px] w-[120px] overflow-hidden rounded-[3px] bg-faint">
        <div class="h-[3px] bg-accent transition-[width] duration-400" style={{ width: pct() + "%" }} />
      </div>
    </>
  );
}
