import type { BookMeta, ChapterMeta, ChapterPatch, DocJSON, SearchHit } from "../types";
import { docText, docWords } from "../../lib/doc";
import { norm, pad } from "../../lib/format";
import { chapterMeta as meta, chapter as newChapter, findBook, findChapter, toMeta, touch } from "./db";

type Ids = { bookId: string; chapterId: string };

export const chapter = {
  chapter_load: ({ bookId, chapterId }: Ids): DocJSON => {
    const b = findBook(bookId);
    return structuredClone(b.chapters[findChapter(b, chapterId)].doc);
  },
  chapter_save: ({ bookId, chapterId, doc }: Ids & { doc: DocJSON }): ChapterMeta => {
    const b = findBook(bookId);
    const c = b.chapters[findChapter(b, chapterId)];
    c.doc = structuredClone(doc);
    c.words = docWords(doc);
    touch(b);
    return meta(c);
  },
  chapter_update: ({ bookId, chapterId, patch }: Ids & { patch: ChapterPatch }): ChapterMeta => {
    const b = findBook(bookId);
    const c = b.chapters[findChapter(b, chapterId)];
    Object.assign(c, patch);
    touch(b);
    return meta(c);
  },
  chapter_insert: ({ bookId, at }: { bookId: string; at: number }): BookMeta => {
    const b = findBook(bookId);
    const i = Math.min(at, b.chapters.length);
    b.chapters.splice(i, 0, newChapter("", "rascunho", { type: "doc", content: [] }));
    b.cur = i;
    touch(b);
    return toMeta(b);
  },
  chapter_split: ({ bookId, chapterId, before, after }: Ids & { before: DocJSON; after: DocJSON }): BookMeta => {
    const b = findBook(bookId);
    const i = findChapter(b, chapterId);
    b.chapters[i].doc = structuredClone(before);
    b.chapters[i].words = docWords(before);
    b.chapters.splice(i + 1, 0, newChapter("", "rascunho", structuredClone(after)));
    b.cur = i + 1;
    touch(b);
    return toMeta(b);
  },
  chapter_move: ({ bookId, from, to }: { bookId: string; from: number; to: number }): BookMeta => {
    const b = findBook(bookId);
    if (to < 0 || to >= b.chapters.length) throw "Posição inválida";
    const currentId = b.chapters[b.cur]?.id;
    const [c] = b.chapters.splice(from, 1);
    b.chapters.splice(to, 0, c);
    b.cur = Math.max(0, b.chapters.findIndex((x) => x.id === currentId));
    touch(b);
    return toMeta(b);
  },
  chapter_delete: ({ bookId, chapterId }: Ids): BookMeta => {
    const b = findBook(bookId);
    if (b.chapters.length === 1) throw "A obra precisa de pelo menos um capítulo";
    b.chapters.splice(findChapter(b, chapterId), 1);
    b.cur = Math.min(b.cur, b.chapters.length - 1);
    touch(b);
    return toMeta(b);
  },
  chapter_search: ({ bookId, q }: { bookId: string; q: string }): SearchHit[] => {
    const query = norm(q.trim());
    if (!query) return [];
    return findBook(bookId)
      .chapters.map((c, index) => ({ c, index }))
      .filter(({ c, index }) => norm(c.title).includes(query) || pad(index + 1).startsWith(query) || norm(docText(c.doc)).includes(query))
      .map(({ c, index }) => ({ index, chapterId: c.id }));
  },
  chapter_markdown: ({ bookId, chapterId }: Ids): string => {
    const b = findBook(bookId);
    const i = findChapter(b, chapterId);
    const c = b.chapters[i];
    return (c.title ? `Capítulo ${i + 1} — ${c.title}` : `Capítulo ${i + 1}`) + "\n\n" + docText(c.doc);
  },
};
