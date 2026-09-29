import type { AreaNode, ChapterPatch, Created, DocJSON, SearchHit } from "../types";
import { docText, docWords } from "../../lib/doc";
import { norm, pad } from "../../lib/format";
import { chapterOrder } from "../../lib/manuscript";
import { locate } from "../../lib/tree";
import { chapter as newChapter, EMPTY, findBook, findChapter, touch } from "./db";
import { insertNode } from "./workspace";

type Ids = { bookId: string; chapterId: string };

export const chapter = {
  chapter_load: ({ bookId, chapterId }: Ids): DocJSON => {
    const b = findBook(bookId);
    findChapter(b, chapterId);
    return b.docs[chapterId] ?? EMPTY;
  },
  chapter_save: ({ bookId, chapterId, doc }: Ids & { doc: DocJSON }): AreaNode => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    b.docs[chapterId] = structuredClone(doc);
    c.words = docWords(doc);
    touch(b);
    return c;
  },
  chapter_update: ({ bookId, chapterId, patch }: Ids & { patch: ChapterPatch }): AreaNode => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    Object.assign(c, patch);
    touch(b);
    return c;
  },
  chapter_split: ({ bookId, chapterId, before, after }: Ids & { before: DocJSON; after: DocJSON }): Created => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    const loc = locate(b.area, chapterId)!;
    const [node, doc] = newChapter("", "rascunho", structuredClone(after));
    b.docs[node.id] = doc;
    insertNode(b.area, loc.parent, loc.index + 1, node);
    b.docs[chapterId] = structuredClone(before);
    c.words = docWords(before);
    b.open = node.id;
    touch(b);
    return { id: node.id, items: b.area };
  },
  chapter_neighbor: ({ bookId, chapterId, step }: Ids & { step: number }): string | null => {
    const list = chapterOrder(findBook(bookId).area);
    const i = list.findIndex((c) => c.id === chapterId);
    if (i < 0) throw "Capítulo não encontrado";
    return list[i + step]?.id ?? null;
  },
  chapter_search: ({ bookId, q }: { bookId: string; q: string }): SearchHit[] => {
    const query = norm(q.trim());
    if (!query) return [];
    const b = findBook(bookId);
    return chapterOrder(b.area)
      .map((c, index) => ({ c, index }))
      .filter(({ c, index }) =>
        norm(c.title).includes(query) || pad(index + 1).startsWith(query) || norm(docText(b.docs[c.id] ?? EMPTY)).includes(query))
      .map(({ c, index }) => ({ index, chapterId: c.id }));
  },
  chapter_markdown: ({ bookId, chapterId }: Ids): string => {
    const b = findBook(bookId);
    const c = findChapter(b, chapterId);
    const n = chapterOrder(b.area).indexOf(c) + 1;
    return (c.title ? `Capítulo ${n} — ${c.title}` : `Capítulo ${n}`) + "\n\n" + docText(b.docs[chapterId] ?? EMPTY);
  },
};
