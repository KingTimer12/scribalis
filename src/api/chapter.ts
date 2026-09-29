import { call } from "./invoke";
import type { AreaNode, ChapterPatch, Created, DocJSON, SearchHit } from "./types";

export const loadChapter = (bookId: string, chapterId: string) => call<DocJSON>("chapter_load", { bookId, chapterId });
/** Saves the text; resolves to the chapter node with its fresh word count. */
export const saveChapter = (bookId: string, chapterId: string, doc: DocJSON) =>
  call<AreaNode>("chapter_save", { bookId, chapterId, doc });
export const updateChapter = (bookId: string, chapterId: string, patch: ChapterPatch) =>
  call<AreaNode>("chapter_update", { bookId, chapterId, patch });
/** Enter x3: resolves to the new chapter's id and the tree. */
export const splitChapter = (bookId: string, chapterId: string, before: DocJSON, after: DocJSON) =>
  call<Created>("chapter_split", { bookId, chapterId, before, after });
/** Previous (-1) or next (1) chapter in reading order; null past either end. */
export const chapterNeighbor = (bookId: string, chapterId: string, step: -1 | 1) =>
  call<string | null>("chapter_neighbor", { bookId, chapterId, step });
export const searchChapters = (bookId: string, q: string) => call<SearchHit[]>("chapter_search", { bookId, q });
export const chapterMarkdown = (bookId: string, chapterId: string) => call<string>("chapter_markdown", { bookId, chapterId });
