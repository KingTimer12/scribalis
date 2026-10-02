export type Status = "rascunho" | "revisao" | "pronto";
export type ImageSlot = "cover" | "header" | "footer" | "separator";

export type Separator = { type: "text"; text: string } | { type: "image"; image: string };

export type MarkJSON = { type: "bold" | "italic" };
export type InlineJSON =
  | { type: "text"; text: string; marks?: MarkJSON[] }
  | { type: "hardBreak" }
  /** `@Name` pointing at a sheet; `label` is the name when it was written. */
  | { type: "mention"; attrs: { id: string; label: string } }
  /** `[[Title]]` pointing at a tree node; an empty `label` shows the node's current title. */
  | { type: "wikiLink"; attrs: { id: string; label: string } };
export type Align = "left" | "center" | "right" | "justify";
export type ParaAttrsJSON = Partial<{
  textAlign: Align | null;
  lineHeight: number | null;
  spaceBefore: number | null;
  spaceAfter: number | null;
  indent: number | null;
}>;
export type BlockJSON =
  | { type: "paragraph"; attrs?: ParaAttrsJSON; content?: InlineJSON[] }
  | { type: "separator" }
  | { type: "image"; attrs: { src: string } };
export interface DocJSON {
  type: "doc";
  content: BlockJSON[];
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  /** Absolute path. */
  cover: string | null;
  chapters: number;
  words: number;
  ready: number;
  updatedAt: number;
  cloud: boolean;
}

/** Book-level fields of the open book; its structure comes separately, as the tree. */
export interface BookMeta {
  id: string;
  title: string;
  author: string;
  /** Last opened node (chapter or not). */
  open: string | null;
  updatedAt: number;
  /** Absolute folder; image fields are relative to it. */
  dir: string;
  cover: string | null;
  header: string | null;
  footer: string | null;
  separator: Separator;
}

export interface SearchHit {
  /** Position in reading order. */
  index: number;
  chapterId: string;
}

export type NodeKind = "manuscript" | "folder" | "chapter" | "text" | "image" | "file";

/**
 * A node of the book's tree. The first root item is the Manuscrito, holding chapters and
 * folders of chapters; the rest are folders, free texts, images and attachments.
 */
export interface AreaNode {
  id: string;
  kind: NodeKind;
  title: string;
  notes: string;
  /** Index card summary; absent when empty. */
  synopsis?: string;
  /** Chapters: relative to the book folder. Other leaves: relative to `area/`. */
  file?: string;
  /** Chapters only. */
  status?: Status;
  /** Chapters only: saved word count. */
  words?: number;
  /** Chapters only, view-only: the chapter file is gone from disk. */
  missing?: boolean;
  children?: AreaNode[];
}

export interface Created {
  id: string;
  items: AreaNode[];
}

export interface LibraryListing {
  books: BookSummary[];
  warnings: string[];
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
}

export interface Prefs {
  theme: "light" | "dark";
  goal: number;
  width: 0 | 1 | 2;
  /** Legacy 3-step text size: Rust reads it only to derive `textPx` for old files. */
  font: 0 | 1 | 2;
  /** Chapter text size in px (even, 14 to 32). */
  textPx: number;
  /** Interface size: 0 normal, 1 large, 2 larger (see UI_SCALES). */
  uiScale: 0 | 1 | 2;
  /** Books whose tree sidebar is collapsed. */
  sidebarClosed: string[];
  /** Books whose main pane shows the Quadro tab. */
  boardTab: string[];
  /** Board card size: 0 P, 1 M, 2 G. */
  cardSize: 0 | 1 | 2;
}

export type BookPatch = Partial<{ title: string; author: string; open: string; separatorText: string }>;
export type ChapterPatch = Partial<{ title: string; notes: string; status: Status }>;
export type PrefsPatch = Partial<Prefs>;

export type ScanKind = "draft" | "research" | "folder" | "text" | "image" | "file";

/** One binder item of a Scrivener project, as scanned by Rust (no text content). */
export interface ScanItem {
  key: string;
  kind: ScanKind;
  title: string;
  children: ScanItem[];
}

export interface ScanView {
  title: string;
  items: ScanItem[];
}

/** Import into a brand-new book, or into the workspace of an existing one. */
export type ImportTarget = { type: "new" } | { type: "book"; id: string };

export interface ImportResult {
  bookId: string;
  chapters: number;
  items: number;
  /** Items that could not be read (missing media, unreadable files). */
  warnings: number;
}

export interface CloudOverview {
  apiUrl: string;
  defaultApiUrl: string;
  connected: boolean;
  /** This computer holds the vault's encryption key. */
  hasCryptKey: boolean;
}

export interface VaultInfo {
  id: string;
  keyId: string;
  createdAt: number;
  books: number;
  usage: { bytes: number; quota: number };
}

export interface KeyInfo {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  current: boolean;
}

/** A new device key; `secret` is shown once to be copied to the other computer. */
export interface NewKey {
  id: string;
  label: string;
  secret: string;
}

export interface Snapshot {
  id: string;
  createdAt: number;
  note: string | null;
  fileCount: number;
  totalSize: number;
}

export interface RemoteBookView {
  id: string;
  title: string;
  snapshots: number;
  latestAt: number | null;
  openComments: number;
  local: boolean;
}

export interface BookCloudView {
  enabled: boolean;
  lastBackupAt: number | null;
  paused: string | null;
  lastCommentsAt: number | null;
  /** Sealed and compressed with the vault key; false for books with public links. */
  encrypted: boolean;
}

export type ShareKind = "chapter" | "workspace";

export interface Share {
  id: string;
  url: string;
  bookId: string;
  kind: ShareKind;
  target: string | null;
  snapshotId: string | null;
  follow: boolean;
  includeNotes: boolean;
  allowComments: boolean;
  createdAt: number;
  expiresAt: number | null;
  views: number;
}

export interface ShareInput {
  bookId: string;
  kind: ShareKind;
  target: string | null;
  freeze: boolean;
  includeNotes: boolean;
  allowComments: boolean;
  expiresInDays: number | null;
}

export interface ShareChange {
  freeze?: boolean;
  includeNotes?: boolean;
  allowComments?: boolean;
  expiresInDays?: number;
  clearExpiry?: boolean;
}

export interface CloudStatus {
  bookId: string;
  state: "sending" | "ok" | "offline" | "error";
  lastBackupAt: number | null;
  message: string | null;
  fileCount: number | null;
}

/** `cloud://progress`: a step of a long cloud job (closing, restoring, downloading). */
export interface CloudProgress {
  bookId: string;
  /** "checking": book `done + 1` of `total` on close; "sending" / "downloading": files; "saving" / "swapping": no count. */
  step: "checking" | "sending" | "downloading" | "saving" | "swapping";
  done: number;
  total: number;
}

export interface CloseReport {
  sent: number;
  failed: { bookId: string; message: string }[];
  timedOut: boolean;
}

// Sheets ("Fichas"): characters, places and abilities, each kind following its own template.
export type SheetKind = "character" | "place" | "ability";
export type FieldType = "input" | "textarea" | "select" | "boolean" | "reference" | "tags";

export interface SheetField {
  id: string;
  label: string;
  type: FieldType;
  /** Choices of a select field; missing on the other types. */
  options?: string[];
  /** Kind a reference field points at. */
  target?: SheetKind;
  /** A reference field that holds several sheets. */
  multiple?: boolean;
}

/** Text, yes/no, or a list (tags, ids of a multiple reference); a single reference is an id. */
export type SheetValue = string | boolean | string[];

export interface Sheet {
  id: string;
  kind: SheetKind;
  name: string;
  /** By field id; only fields of the kind's template. */
  values: Record<string, SheetValue>;
}

export interface Sheets {
  version: number;
  templates: Record<SheetKind, SheetField[]>;
  /** Every kind together, in creation order. */
  sheets: Sheet[];
}

export interface SheetCreated {
  id: string;
  sheets: Sheets;
}
