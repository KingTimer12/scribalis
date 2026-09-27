import { createStore, produce } from "solid-js/store";
import type { BookMeta, BookSummary, Prefs, SearchHit, UpdateInfo } from "../api/types";
import { DEFAULT_PREFS } from "../lib/constants";
import type { Panel, View } from "../lib/types";

export interface PromptState {
  label: string;
  value: string;
  submit: (value: string) => void;
}

export interface AppState {
  /** False until the first library listing arrives. */
  ready: boolean;
  library: BookSummary[];
  /** Metadata of the open book (no chapter texts). */
  book: BookMeta | null;
  /** Open book id, or the last opened one (highlighted in the library). */
  curId: string | null;
  view: View;
  prefs: Prefs;
  focus: boolean;
  panel: Panel | null;
  // palette
  q: string;
  pIdx: number;
  confirmDel: boolean;
  hits: SearchHit[];
  prompt: PromptState | null;
  // index
  indexSel: number;
  // bottom bar
  toast: string;
  toastKey: number;
  tripleHint: boolean;
  liveWords: number;
  today: number;
  // library
  libSel: number;
  libQ: string;
  /** id of the book being renamed, or "new" for a new book. */
  renaming: string | null;
  renameVal: string;
  libConfirm: string | null;
  // updater
  /** Newer release found at startup, or null. */
  update: UpdateInfo | null;
  /** True while the update downloads and installs. */
  updating: boolean;
}

export const [state, setState] = createStore<AppState>({
  ready: false,
  library: [],
  book: null,
  curId: null,
  view: "library",
  prefs: { ...DEFAULT_PREFS },
  focus: false,
  panel: null,
  q: "",
  pIdx: 0,
  confirmDel: false,
  hits: [],
  prompt: null,
  indexSel: 0,
  toast: "",
  toastKey: 0,
  tripleHint: false,
  liveWords: 0,
  today: 0,
  libSel: 0,
  libQ: "",
  renaming: null,
  renameVal: "",
  libConfirm: null,
  update: null,
  updating: false,
});

/** Values outside the store: they never need to re-render anything. */
export const session = {
  /** id reserved for the book being created (only picks the cover tone). */
  newId: "",
};

/** Mutates the open book in place; no-op when none is open. */
export function editBook(fn: (book: BookMeta) => void) {
  setState(
    produce((s) => {
      if (s.book) fn(s.book);
    }),
  );
}
