export type Status = "rascunho" | "revisao" | "pronto";
export type ImageSlot = "cover" | "header" | "footer" | "separator";

export type Separator = { type: "text"; text: string } | { type: "image"; image: string };

export type MarkJSON = { type: "bold" | "italic" };
export type InlineJSON = { type: "text"; text: string; marks?: MarkJSON[] } | { type: "hardBreak" };
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

export interface ChapterMeta {
  id: string;
  title: string;
  status: Status;
  notes: string;
  words: number;
}

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  cur: number;
  updatedAt: number;
  /** Absolute folder; image fields are relative to it. */
  dir: string;
  cover: string | null;
  header: string | null;
  footer: string | null;
  separator: Separator;
  chapters: ChapterMeta[];
}

export interface SearchHit {
  index: number;
  chapterId: string;
}

export type NodeKind = "folder" | "text" | "image" | "file";

/** A node of a book's workspace ("area") tree: folders, texts, images and attachments. */
export interface AreaNode {
  id: string;
  kind: NodeKind;
  title: string;
  notes: string;
  /** Path relative to the book's `area/` folder; only non-folders have one. */
  file?: string;
  children?: AreaNode[];
}

export interface Created {
  id: string;
  items: AreaNode[];
}

export interface ToChapterResult {
  book: BookMeta;
  items: AreaNode[];
}

/** A chapter turned into a workspace text: the book without it, the new node's id and the tree. */
export interface FromChapterResult {
  book: BookMeta;
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
  font: 0 | 1 | 2;
}

export type BookPatch = Partial<{ title: string; author: string; cur: number; separatorText: string }>;
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
