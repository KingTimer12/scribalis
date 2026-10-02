import { createStore, produce } from "solid-js/store";
import type {
  AreaNode, BookCloudView, BookMeta, BookSummary, CloudOverview, CloudProgress, CloudStatus, ImportTarget, Prefs, ScanView,
  SearchHit, ShareKind, SheetField, SheetKind, Sheets, UpdateInfo,
} from "../api/types";
import { DEFAULT_PREFS } from "../lib/constants";
import { findNode } from "../lib/tree";
import type { Panel, View } from "../lib/types";

export interface PromptState {
  label: string;
  value: string;
  submit: (value: string) => void;
}

/** Scrivener import dialog: the scanned project and the items marked as chapters. */
export interface ScrivenerImportState {
  path: string;
  view: ScanView;
  chosen: string[];
  target: ImportTarget;
  busy: boolean;
}

export interface ShareDraft {
  kind: ShareKind;
  target: string | null;
  /** What the form says is being shared ("Capítulo 03", "Área de trabalho", item title). */
  label: string;
}

/** Long cloud job (closing, restoring, downloading) drawn by the big overlay. */
export interface CloudJob {
  kind: "close" | "restore" | "download";
  phase: "working" | "done" | "error";
  /** Book being worked on; on close it changes as each book is checked. */
  bookId: string | null;
  /** "reopening" is the webview opening the restored book. */
  step: CloudProgress["step"] | "reopening" | null;
  done: number;
  total: number;
  /** Book `n` of `of`, while closing. */
  book: { n: number; of: number } | null;
  /** Detail line of the done or error card. */
  message: string;
}

export interface AppState {
  /** False until the first library listing arrives. */
  ready: boolean;
  library: BookSummary[];
  /** Book-level fields of the open book; its structure is `area`. */
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
  hits: SearchHit[];
  prompt: PromptState | null;
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
  // updater
  /** Newer release found at startup, or null. */
  update: UpdateInfo | null;
  /** True while the update downloads and installs. */
  updating: boolean;
  // the book's tree
  area: AreaNode[];
  areaSel: string | null;
  /** Node shown in the main pane: a chapter or text in the editor, or an image/attachment preview. */
  areaOpen: string | null;
  /** Ids of expanded folders. */
  areaExpanded: string[];
  areaRenaming: string | null;
  areaRenameVal: string;
  /** Open Scrivener import dialog, or null. */
  scrivener: ScrivenerImportState | null;
  // cloud
  cloud: CloudOverview | null;
  /** Backup state of the open book. */
  cloudBook: BookCloudView | null;
  /** Last status event from the Rust backup (any book). */
  cloudStatus: CloudStatus | null;
  /** Link being created from a context menu or command: opens the share form in the cloud panel. */
  shareDraft: ShareDraft | null;
  cloudJob: CloudJob | null;
  /** Board of the open folder (or document): opening text of its documents, by id, as card placeholders. */
  boardExcerpts: Record<string, string>;
  /** The selected index card. */
  boardSel: string | null;
  // sheets ("Fichas")
  /** Section of the open book: the tree and editor, or the character and place sheets. */
  bookTab: "write" | "sheets";
  /** Sheets of the open book; null until the Fichas tab first opens. */
  sheets: Sheets | null;
  sheetKind: SheetKind;
  /** Sheet open in the form, or null for the card grid. */
  sheetSel: string | null;
  sheetQ: string;
  /** Copy of the kind's template being edited, or null. */
  templateDraft: SheetField[] | null;
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
  hits: [],
  prompt: null,
  toast: "",
  toastKey: 0,
  tripleHint: false,
  liveWords: 0,
  today: 0,
  libSel: 0,
  libQ: "",
  renaming: null,
  renameVal: "",
  update: null,
  updating: false,
  area: [],
  areaSel: null,
  areaOpen: null,
  areaExpanded: [],
  areaRenaming: null,
  areaRenameVal: "",
  scrivener: null,
  cloud: null,
  cloudBook: null,
  cloudStatus: null,
  shareDraft: null,
  cloudJob: null,
  boardExcerpts: {},
  boardSel: null,
  bookTab: "write",
  sheets: null,
  sheetKind: "character",
  sheetSel: null,
  sheetQ: "",
  templateDraft: null,
});

/** Values outside the store: they never need to re-render anything. */
export const session = {
  /** id reserved for the book being created (only picks the cover tone). */
  newId: "",
};

/** Mutates a node of the open book's tree in place; no-op when it is gone. */
export function editNode(id: string, fn: (node: AreaNode) => void) {
  setState(
    produce((s) => {
      const n = findNode(s.area, id);
      if (n) fn(n);
    }),
  );
}

/** Mutates the open book in place; no-op when none is open. */
export function editBook(fn: (book: BookMeta) => void) {
  setState(
    produce((s) => {
      if (s.book) fn(s.book);
    }),
  );
}
