import { FONT_LABEL, GOALS, WIDTH_LABEL } from "../lib/constants";
import { fmt } from "../lib/format";
import type { Panel } from "../lib/types";
import { focusTarget, type FocusTarget } from "./focus";
import { currentBook, setPrefs, setState, state } from "./state";

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Short message in the center of the bottom bar. */
export function flash(msg: string) {
  clearTimeout(toastTimer);
  setState({ toast: msg, toastKey: state.toastKey + 1, tripleHint: false });
  toastTimer = setTimeout(() => setState("toast", ""), 1800);
}

export const homeTarget = (): FocusTarget => (state.view === "library" ? "lib" : "body");

/** Closes any panel and returns focus to the main screen. */
export function closePanel() {
  focusTarget(homeTarget());
  if (!state.panel) return;
  setState({ panel: null, q: "", pIdx: 0, confirmDel: false });
}

/** Opens a panel; closes it if already open. */
export function openPanel(name: Panel) {
  if (state.panel === name) return closePanel();
  focusTarget(name, name === "notes" ? "end" : null);
  setState({ panel: name, q: "", pIdx: 0, confirmDel: false, indexSel: currentBook()?.cur ?? 0 });
}

export function toggleTheme() {
  setPrefs({ theme: state.prefs.theme === "dark" ? "light" : "dark" });
}

export function toggleFocusMode() {
  const on = !state.focus;
  setState("focus", on);
  flash(on ? "Modo foco" : "Modo foco desligado");
}

export function cycleGoal() {
  const g = GOALS[(GOALS.indexOf(state.prefs.goal) + 1) % GOALS.length];
  setPrefs({ goal: g });
  flash("Meta diária: " + fmt(g) + " palavras");
}

export function cycleWidth() {
  const w = ((state.prefs.width + 1) % 3) as 0 | 1 | 2;
  setPrefs({ width: w });
  flash("Largura " + WIDTH_LABEL[w]);
}

export function cycleFont() {
  const f = ((state.prefs.font + 1) % 3) as 0 | 1 | 2;
  setPrefs({ font: f });
  flash("Letra " + FONT_LABEL[f]);
}
