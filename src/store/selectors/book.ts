import type { ChapterMeta } from "../../api/types";
import { fmt, plural } from "../../lib/format";
import { state } from "../state";

export const currentChapter = (): ChapterMeta | undefined => state.book?.chapters[state.book.cur];

/** Book total using the live count for the open chapter. */
export const bookWordsLive = () => {
  const b = state.book;
  if (!b) return 0;
  return b.chapters.reduce((a, c, i) => a + (i === b.cur ? state.liveWords : c.words), 0);
};

/** "3 capítulos · 1.234 na obra" label. */
export const bookLabel = () =>
  plural(state.book?.chapters.length ?? 0, "capítulo", "capítulos") + " · " + fmt(bookWordsLive()) + " na obra";

/** Daily progress: saved total from Rust plus unsaved typing in the open chapter. */
export const todayLive = () => Math.max(0, state.today + state.liveWords - (currentChapter()?.words ?? 0));
