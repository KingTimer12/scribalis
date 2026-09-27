import { createStore, produce } from "solid-js/store";
import { sampleBooks } from "../data/samples";
import { DEFAULT_PREFS } from "../lib/constants";
import { allWords, bookWords, fmt, norm, plural } from "../lib/format";
import { loadData } from "../lib/storage";
import type { Book, Chapter, Panel, Prefs, View } from "../lib/types";

export interface AppState {
  books: Book[];
  /** Open book (or the last opened one, highlighted in the library). */
  curId: string | null;
  view: View;
  prefs: Prefs;
  focus: boolean;
  panel: Panel | null;
  // palette
  q: string;
  pIdx: number;
  confirmDel: boolean;
  // index
  indexSel: number;
  // bottom bar
  toast: string;
  toastKey: number;
  tripleHint: boolean;
  // library
  libSel: number;
  libQ: string;
  /** id of the book being renamed, or "new" for a new book. */
  renaming: string | null;
  renameVal: string;
  libConfirm: string | null;
}

const saved = loadData();
const initialBooks = saved?.books ?? sampleBooks();

export const [state, setState] = createStore<AppState>({
  books: initialBooks,
  curId: null,
  view: "library",
  prefs: { ...DEFAULT_PREFS, ...saved?.prefs },
  focus: false,
  panel: null,
  q: "",
  pIdx: 0,
  confirmDel: false,
  indexSel: 0,
  toast: "",
  toastKey: 0,
  tripleHint: false,
  libSel: 0,
  libQ: "",
  renaming: null,
  renameVal: "",
  libConfirm: null,
});

/** Values outside the store: they never need to re-render anything. */
export const session = {
  /** Total words at session start, baseline for the daily goal. */
  baseWords: allWords(initialBooks),
  /** Consecutive Enters in the body (3 = new chapter). */
  enterStreak: 0,
  /** id reserved for the book being created. */
  newId: "",
};

/* ---------- selectors ---------- */

export const currentBookIndex = () => state.books.findIndex((b) => b.id === state.curId);

export const currentBook = (): Book | undefined => state.books[currentBookIndex()];

export const currentChapter = (): Chapter | undefined => {
  const b = currentBook();
  return b ? b.chapters[b.cur] : undefined;
};

/** "3 capítulos · 1.234 na obra" label. */
export const bookLabel = () => {
  const b = currentBook();
  const n = b?.chapters.length ?? 0;
  return plural(n, "capítulo", "capítulos") + " · " + fmt(b ? bookWords(b) : 0) + " na obra";
};

export const sortedBooks = () =>
  state.books.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

/** Books shown in the library: most recent first, filtered by the query. */
export const libList = () => {
  const q = norm(state.libQ.trim());
  const list = sortedBooks();
  return q ? list.filter((b) => norm(b.title).includes(q)) : list;
};

export const libSelIndex = (list = libList()) => Math.min(state.libSel, Math.max(0, list.length - 1));

/* ---------- mutations ---------- */

/** Mutates the open book. `touch` bumps its edit date. */
export function editBook(mut: (b: Book) => void, touch = true) {
  const i = currentBookIndex();
  if (i < 0) return;
  setState(
    "books",
    i,
    produce((b) => {
      mut(b);
      if (touch) b.updatedAt = Date.now();
    }),
  );
}

/** Mutates the current chapter of the open book. */
export function updCur(patch: Partial<Chapter>) {
  editBook((b) => Object.assign(b.chapters[b.cur], patch));
}

export function setPrefs(patch: Partial<Prefs>) {
  setState("prefs", patch);
}
