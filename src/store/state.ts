import { createStore, produce } from "solid-js/store";
import { sampleBooks } from "../data/samples";
import { DEFAULT_PREFS } from "../lib/constants";
import { allWords, bookWords, fmt, norm, plural } from "../lib/format";
import { loadData } from "../lib/storage";
import type { Book, Chapter, Panel, Prefs, View } from "../lib/types";

export interface AppState {
  books: Book[];
  /** Obra aberta (ou a última aberta, para destacar na biblioteca). */
  curId: string | null;
  view: View;
  prefs: Prefs;
  focus: boolean;
  panel: Panel | null;
  // paleta
  q: string;
  pIdx: number;
  confirmDel: boolean;
  // índice
  indexSel: number;
  // barra inferior
  toast: string;
  toastKey: number;
  tripleHint: boolean;
  // biblioteca
  libSel: number;
  libQ: string;
  /** id da obra sendo renomeada, ou "new" para a obra nova. */
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

/** Valores fora do store: não precisam re-renderizar nada. */
export const session = {
  /** Total de palavras no início da sessão, base da meta diária. */
  baseWords: allWords(initialBooks),
  /** Enters seguidos no texto (3 = novo capítulo). */
  enterStreak: 0,
  /** id reservado para a obra que está sendo criada. */
  newId: "",
};

/* ---------- seletores ---------- */

export const currentBookIndex = () => state.books.findIndex((b) => b.id === state.curId);

export const currentBook = (): Book | undefined => state.books[currentBookIndex()];

export const currentChapter = (): Chapter | undefined => {
  const b = currentBook();
  return b ? b.chapters[b.cur] : undefined;
};

/** "3 capítulos · 1.234 na obra" */
export const bookLabel = () => {
  const b = currentBook();
  const n = b?.chapters.length ?? 0;
  return plural(n, "capítulo", "capítulos") + " · " + fmt(b ? bookWords(b) : 0) + " na obra";
};

export const sortedBooks = () =>
  state.books.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

/** Obras visíveis na biblioteca: mais recentes primeiro, filtradas pela busca. */
export const libList = () => {
  const q = norm(state.libQ.trim());
  const list = sortedBooks();
  return q ? list.filter((b) => norm(b.title).includes(q)) : list;
};

export const libSelIndex = (list = libList()) => Math.min(state.libSel, Math.max(0, list.length - 1));

/* ---------- mutações ---------- */

/** Altera a obra aberta. `touch` atualiza a data de edição. */
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

/** Altera o capítulo atual da obra aberta. */
export function updCur(patch: Partial<Chapter>) {
  editBook((b) => Object.assign(b.chapters[b.cur], patch));
}

export function setPrefs(patch: Partial<Prefs>) {
  setState("prefs", patch);
}
