import type { AreaNode } from "../../api/types";
import { fmt, plural } from "../../lib/format";
import { chapterNumber, chapterOrder } from "../../lib/manuscript";
import { state } from "../state";
import { openAreaNode } from "./workspace";

/** The chapter open in the editor, when the open node is one. */
export const currentChapter = (): AreaNode | null => {
  const n = openAreaNode();
  return n?.kind === "chapter" ? n : null;
};

/** Reading-order number of the open chapter; 0 when none is open. */
export const currentNumber = () => {
  const c = currentChapter();
  return c ? chapterNumber(state.area, c.id) : 0;
};

/** Book total, using the live count for the open chapter. */
export const bookWordsLive = () =>
  chapterOrder(state.area).reduce((a, c) => a + (c.id === state.areaOpen ? state.liveWords : (c.words ?? 0)), 0);

/** "3 capítulos · 1.234 na obra" label. */
export const bookLabel = () =>
  plural(chapterOrder(state.area).length, "capítulo", "capítulos") + " · " + fmt(bookWordsLive()) + " na obra";

/** Daily progress: saved total from Rust plus unsaved typing in the open chapter. */
export const todayLive = () => {
  const c = currentChapter();
  return Math.max(0, state.today + (c ? state.liveWords - (c.words ?? 0) : 0));
};
