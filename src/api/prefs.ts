import { call } from "./invoke";
import type { Prefs, PrefsPatch } from "./types";

export const getPrefs = () => call<Prefs>("prefs_get");
export const setPrefs = (patch: PrefsPatch) => call<Prefs>("prefs_set", { patch });
export const statsToday = () => call<{ today: number }>("stats_today");
