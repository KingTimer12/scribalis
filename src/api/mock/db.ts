import type { BookMeta, BookSummary, ChapterMeta, DocJSON, Prefs, Separator } from "../types";
import { docWords } from "../../lib/doc";

export interface MockChapter extends ChapterMeta {
  doc: DocJSON;
}
export interface MockBook {
  id: string;
  title: string;
  author: string;
  cur: number;
  updatedAt: number;
  separator: Separator;
  header: string | null;
  footer: string | null;
  chapters: MockChapter[];
}

let seq = 0;
export const mockId = () => "m" + Date.now().toString(36) + (seq++).toString(36);

export const para = (text: string): DocJSON => ({
  type: "doc",
  content: text.split("\n\n").map((t) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text: t }] })),
});

export function chapter(title: string, status: ChapterMeta["status"], doc: DocJSON, notes = ""): MockChapter {
  return { id: mockId(), title, status, notes, doc, words: docWords(doc) };
}

function samples(): MockBook[] {
  const now = Date.now();
  const book = (title: string, hours: number, cur: number, chapters: MockChapter[]): MockBook => ({
    id: mockId(), title, author: "", cur, updatedAt: now - hours * 3600000,
    separator: { type: "text", text: "* * *" }, header: null, footer: null, chapters,
  });
  return [
    book("A Torre das Mil Luas", 2, 1, [
      chapter("O sino que não tocava", "pronto", para("Na cidade de Vael, todo mundo sabia que o sino da torre norte não tocava havia cem anos.")),
      chapter("A aprendiz de cartógrafo", "revisao", {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "O mapa de Ilen tinha um erro." }] },
          { type: "separator" },
          { type: "paragraph", content: [{ type: "text", text: "Mestre Odran dizia que mapas não mentem." }] },
        ],
      }),
    ]),
    book("Herdeira das Cinzas", 27, 0, [chapter("A coroação que não houve", "rascunho", para("A coroa chegou ao salão."))]),
  ];
}

export const db = { books: samples(), prefs: { theme: "light", goal: 2000, width: 1, font: 1 } as Prefs, base: 0 };
db.base = db.books.reduce((a, b) => a + b.chapters.reduce((x, c) => x + c.words, 0), 0);

export function findBook(id: string): MockBook {
  const b = db.books.find((x) => x.id === id);
  if (!b) throw "Obra não encontrada";
  return b;
}

export function findChapter(book: MockBook, id: string): number {
  const i = book.chapters.findIndex((c) => c.id === id);
  if (i < 0) throw "Capítulo não encontrado";
  return i;
}

export const touch = (b: MockBook) => (b.updatedAt = Date.now());

/** Chapter metadata without the document. */
export const chapterMeta = (c: MockChapter): ChapterMeta => ({
  id: c.id, title: c.title, status: c.status, notes: c.notes, words: c.words,
});

export const toMeta = (b: MockBook): BookMeta => ({
  id: b.id, title: b.title, author: b.author, cur: b.cur, updatedAt: b.updatedAt, dir: "/mock/" + b.id,
  cover: null, header: b.header, footer: b.footer, separator: b.separator,
  chapters: b.chapters.map(chapterMeta),
});

export const toSummary = (b: MockBook): BookSummary => ({
  id: b.id, title: b.title, author: b.author, cover: null, chapters: b.chapters.length,
  words: b.chapters.reduce((a, c) => a + c.words, 0),
  ready: b.chapters.filter((c) => c.status === "pronto").length, updatedAt: b.updatedAt,
});

export const resetSamples = () => db.books.push(...samples());
