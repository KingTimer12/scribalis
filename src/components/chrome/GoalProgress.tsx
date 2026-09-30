import { fmt } from "../../lib/format";
import { openPanel } from "../../store/actions/ui";
import { todayLive } from "../../store/selectors/book";
import { state } from "../../store/state";

/** Daily goal: words written this session across all books. Click opens Ajustes to change the goal. */
export function GoalProgress() {
  const pct = () => Math.min(100, Math.round((todayLive() / state.prefs.goal) * 100));
  return (
    <button type="button" class="goal-btn" title="Meta diária — mudar em Ajustes" onClick={() => openPanel("settings")}>
      <span>
        {fmt(todayLive())} de {fmt(state.prefs.goal)} hoje
      </span>
      <div class="h-[3px] w-[120px] overflow-hidden rounded-[3px] bg-faint">
        <div class="h-[3px] bg-accent transition-[width] duration-400" style={{ width: pct() + "%" }} />
      </div>
    </button>
  );
}
