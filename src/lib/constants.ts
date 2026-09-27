import type { Prefs, Status } from "./types";

export const STATUS: Status[] = ["rascunho", "revisao", "pronto"];
export const STATUS_LABEL: Record<Status, string> = {
  rascunho: "Rascunho",
  revisao: "Revisão",
  pronto: "Pronto",
};
export const GOALS = [1000, 2000, 3000, 5000];
export const WIDTH_LABEL = ["estreita", "média", "larga"];
export const FONT_LABEL = ["pequena", "média", "grande"];

/** Capas por linha na biblioteca (também usado pela navegação ↑↓). */
export const COLS = 6;

export const HOUR = 3600000;
export const DAY = 86400000;

export const DEFAULT_PREFS: Prefs = { theme: "light", goal: 2000, width: 1, font: 1 };
