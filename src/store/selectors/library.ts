import { norm } from "../../lib/format";
import { state } from "../state";

export const sortedLibrary = () => state.library.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

/** Books shown in the library: most recent first, filtered by the query. */
export const libList = () => {
  const q = norm(state.libQ.trim());
  const list = sortedLibrary();
  return q ? list.filter((b) => norm(b.title).includes(q)) : list;
};

export const libSelIndex = (list = libList()) => Math.min(state.libSel, Math.max(0, list.length - 1));
