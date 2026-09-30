import { state } from "../state";
import { updatePrefs } from "./prefs";

export type MainTab = "editor" | "board";

/** Tab of the main pane for the open book; saved per book in the Rust prefs. */
export const mainTab = (): MainTab => (state.book && state.prefs.boardTab.includes(state.book.id) ? "board" : "editor");

export function setMainTab(tab: MainTab) {
  const id = state.book?.id;
  if (!id || mainTab() === tab) return;
  const others = state.prefs.boardTab.filter((x) => x !== id);
  updatePrefs({ boardTab: tab === "board" ? [...others, id] : others });
}
