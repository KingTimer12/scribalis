import * as api from "../../api/prefs";
import type { PrefsPatch } from "../../api/types";
import { FONT_LABEL, GOALS, WIDTH_LABEL } from "../../lib/constants";
import { fmt } from "../../lib/format";
import { setState, state } from "../state";
import { flash, flashError } from "./ui";

export async function loadPrefs() {
  try {
    setState("prefs", await api.getPrefs());
  } catch (e) {
    flashError(e);
  }
}

/** Applies locally at once, then persists in Rust. */
export function updatePrefs(patch: PrefsPatch) {
  setState("prefs", patch);
  api.setPrefs(patch).catch(flashError);
}

export const toggleTheme = () => updatePrefs({ theme: state.prefs.theme === "dark" ? "light" : "dark" });

export function cycleGoal() {
  const goal = GOALS[(GOALS.indexOf(state.prefs.goal) + 1) % GOALS.length];
  updatePrefs({ goal });
  flash("Meta diária: " + fmt(goal) + " palavras");
}

export function cycleWidth() {
  const width = ((state.prefs.width + 1) % 3) as 0 | 1 | 2;
  updatePrefs({ width });
  flash("Largura " + WIDTH_LABEL[width]);
}

export function cycleFont() {
  const font = ((state.prefs.font + 1) % 3) as 0 | 1 | 2;
  updatePrefs({ font });
  flash("Letra " + FONT_LABEL[font]);
}
