import { moveChapter, openFromIndex } from "../actions/chapters";
import { setState, state } from "../state";

/** Chapter drawer: arrows navigate, Alt+arrows reorder, Enter opens. */
export async function indexKey(e: KeyboardEvent) {
  const n = state.book?.chapters.length ?? 0;
  const sel = state.indexSel;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.altKey) {
      const to = await moveChapter(sel, dir);
      if (to != null) setState("indexSel", to);
    } else setState("indexSel", Math.max(0, Math.min(n - 1, sel + dir)));
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    openFromIndex(sel);
  }
}
