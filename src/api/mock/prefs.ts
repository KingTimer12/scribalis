import type { Prefs, PrefsPatch } from "../types";
import { db } from "./db";

export const prefs = {
  prefs_get: (): Prefs => ({ ...db.prefs }),
  prefs_set: ({ patch }: { patch: PrefsPatch }): Prefs => Object.assign(db.prefs, patch),
  stats_today: () => ({
    today: Math.max(0, db.books.reduce((a, b) => a + b.chapters.reduce((x, c) => x + c.words, 0), 0) - db.base),
  }),
};
