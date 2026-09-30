import * as api from "../../api/prefs";
import type { PrefsPatch } from "../../api/types";
import {
  GOALS, TEXT_PX_DEFAULT, TEXT_PX_MAX, TEXT_PX_MIN, TEXT_PX_STEP, UI_SCALE_LABEL, UI_SCALES, WIDTH_LABEL,
} from "../../lib/constants";
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

function setTextPx(px: number) {
  const textPx = Math.max(TEXT_PX_MIN, Math.min(TEXT_PX_MAX, px));
  if (textPx !== state.prefs.textPx) updatePrefs({ textPx });
  flash("Texto " + textPx + " px");
}

export const textBigger = () => setTextPx(state.prefs.textPx + TEXT_PX_STEP);
export const textSmaller = () => setTextPx(state.prefs.textPx - TEXT_PX_STEP);
export const textReset = () => setTextPx(TEXT_PX_DEFAULT);

export function setUiScale(n: number) {
  const uiScale = Math.max(0, Math.min(UI_SCALES.length - 1, Math.round(n))) as 0 | 1 | 2;
  updatePrefs({ uiScale });
  flash("Interface " + UI_SCALE_LABEL[uiScale]);
}

export const cycleUiScale = () => setUiScale((state.prefs.uiScale + 1) % UI_SCALES.length);
