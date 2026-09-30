import type { AreaNode, BoardCard, BookMeta, BookSummary, DocJSON, Prefs, Separator, Share, Snapshot, Status } from "../types";
import { docWords } from "../../lib/doc";
import { chapterOrder, manuscriptWords } from "../../lib/manuscript";

/** A mock book: book-level fields, the v2 tree and every document keyed by node id. */
export interface MockBook {
  id: string;
  title: string;
  author: string;
  /** Last opened node. */
  open: string | null;
  updatedAt: number;
  separator: Separator;
  header: string | null;
  footer: string | null;
  /** The Manuscrito (with the chapters) first, then folders, texts, images and attachments. */
  area: AreaNode[];
  /** Documents of chapters and texts; ids never change on conversion, so neither do the keys. */
  docs: Record<string, DocJSON>;
  /** The book's board (order + titles) and each card's text. */
  board?: BoardCard[];
  boardText?: Record<string, string>;
}

let seq = 0;
export const mockId = () => "m" + Date.now().toString(36) + (seq++).toString(36);

export const EMPTY: DocJSON = { type: "doc", content: [] };

export const para = (text: string): DocJSON => ({
  type: "doc",
  content: text.split("\n\n").map((t) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: t }] })),
});

/** A chapter node and its document. */
export function chapter(title: string, status: Status, doc: DocJSON, notes = ""): [AreaNode, DocJSON] {
  const id = mockId();
  return [{ id, kind: "chapter", title, notes, file: "capitulos/" + id + ".md", status, words: docWords(doc) }, doc];
}

/** A v2 book whose Manuscrito holds `chapters`, open on chapter `open`. */
export function mockBook(title: string, chapters: [AreaNode, DocJSON][], open = 0, updatedAt = Date.now()): MockBook {
  const docs: Record<string, DocJSON> = {};
  const nodes = chapters.map(([node, doc]) => {
    docs[node.id] = doc;
    return node;
  });
  return {
    id: mockId(), title, author: "", open: nodes[open]?.id ?? null, updatedAt,
    separator: { type: "text", text: "* * *" }, header: null, footer: null,
    area: [{ id: mockId(), kind: "manuscript", title: "Manuscrito", notes: "", children: nodes }],
    docs,
  };
}

function samples(): MockBook[] {
  const now = Date.now();
  return [
    mockBook("A Torre das Mil Luas", [
      chapter("O sino que não tocava", "pronto", para("Na cidade de Vael, todo mundo sabia que o sino da torre norte não tocava havia cem anos.")),
      chapter("A aprendiz de cartógrafo", "revisao", {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "O mapa de Ilen tinha um erro." }] },
          { type: "separator" },
          { type: "paragraph", content: [{ type: "text", text: "Mestre Odran dizia que mapas não mentem." }] },
        ],
      }),
    ], 1, now - 2 * 3600000),
    mockBook("Herdeira das Cinzas", [chapter("A coroação que não houve", "rascunho", para("A coroa chegou ao salão."))], 0, now - 27 * 3600000),
  ];
}

/** Saved words of a book's chapters. */
export const bookWords = (b: MockBook) => manuscriptWords(b.area);

export const db = {
  books: samples(),
  prefs: { theme: "light", goal: 2000, width: 1, font: 1, textPx: 20, uiScale: 0, sidebarClosed: [], boardTab: [], cardSize: 1 } as Prefs,
  base: 0,
};
db.base = db.books.reduce((a, b) => a + bookWords(b), 0);

export interface MockCloudBook {
  enabled: boolean;
  lastBackupAt: number | null;
  lastCommentsAt?: number | null;
  snapshots: Snapshot[];
}

/** In-memory vault for the browser build. */
export const cloudDb = {
  apiUrl: "https://kingtimer12.dev/api/scribalis/v1",
  connected: false,
  books: {} as Record<string, MockCloudBook>,
  shares: [] as Share[],
  /** Comments waiting on the server, per book: [nodeId, text]. */
  comments: {} as Record<string, [string, string][]>,
};

export function findBook(id: string): MockBook {
  const b = db.books.find((x) => x.id === id);
  if (!b) throw "Obra não encontrada";
  return b;
}

/** A chapter node of `book`; any other id is Rust's "Capítulo não encontrado". */
export function findChapter(book: MockBook, id: string): AreaNode {
  const c = chapterOrder(book.area).find((x) => x.id === id);
  if (!c) throw "Capítulo não encontrado";
  return c;
}

export const touch = (b: MockBook) => (b.updatedAt = Date.now());

export const toMeta = (b: MockBook): BookMeta => ({
  id: b.id, title: b.title, author: b.author, open: b.open, updatedAt: b.updatedAt, dir: "/mock/" + b.id,
  cover: null, header: b.header, footer: b.footer, separator: b.separator,
});

/** Alias used by `book_open` and by the cloud mock (`cloud_restore`). */
export const toBookMeta = toMeta;

export const toSummary = (b: MockBook): BookSummary => {
  const list = chapterOrder(b.area);
  return {
    id: b.id, title: b.title, author: b.author, cover: null, chapters: list.length, words: bookWords(b),
    ready: list.filter((c) => c.status === "pronto").length, updatedAt: b.updatedAt,
    cloud: !!cloudDb.books[b.id]?.lastBackupAt,
  };
};

export const resetSamples = () => db.books.push(...samples());
