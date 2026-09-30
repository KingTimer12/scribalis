import type { Prefs, Status } from "../api/types";

export const STATUS: Status[] = ["rascunho", "revisao", "pronto"];
export const STATUS_LABEL: Record<Status, string> = {
  rascunho: "Rascunho",
  revisao: "Revisão",
  pronto: "Pronto",
};
export const GOALS = [1000, 2000, 3000, 5000];
export const WIDTH_LABEL = ["estreita", "média", "larga"];

/** Chapter text size, in px on screen. */
export const TEXT_PX_MIN = 14;
export const TEXT_PX_MAX = 32;
export const TEXT_PX_STEP = 2;
export const TEXT_PX_DEFAULT = 20;

/** Interface zoom factor per `uiScale`. */
export const UI_SCALES = [1, 1.15, 1.3];
export const UI_SCALE_LABEL = ["Normal", "Grande", "Maior"];

/** Covers per library row (also used by ↑↓ navigation). */
export const COLS = 6;

export const HOUR = 3600000;
export const DAY = 86400000;

export const DEFAULT_PREFS: Prefs = {
  theme: "light", goal: 2000, width: 1, font: 1, textPx: 20, uiScale: 0, sidebarClosed: [], boardTab: [], cardSize: 1,
};

/** Longest synopsis, in characters (Rust cuts at the same length). */
export const SYNOPSIS_MAX = 2000;

/** Longest card title and text, in characters (Rust cuts at the same length). */
export const CARD_TITLE_MAX = 200;
export const CARD_TEXT_MAX = 20000;
