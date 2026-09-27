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
