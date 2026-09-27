import { call } from "./invoke";
import type { BookMeta, ChapterMeta, ChapterPatch, DocJSON, SearchHit } from "./types";

export const loadChapter = (bookId: string, chapterId: string) => call<DocJSON>("chapter_load", { bookId, chapterId });
export const saveChapter = (bookId: string, chapterId: string, doc: DocJSON) =>
  call<ChapterMeta>("chapter_save", { bookId, chapterId, doc });
export const updateChapter = (bookId: string, chapterId: string, patch: ChapterPatch) =>
  call<ChapterMeta>("chapter_update", { bookId, chapterId, patch });
export const insertChapter = (bookId: string, at: number) => call<BookMeta>("chapter_insert", { bookId, at });
export const splitChapter = (bookId: string, chapterId: string, before: DocJSON, after: DocJSON) =>
  call<BookMeta>("chapter_split", { bookId, chapterId, before, after });
export const moveChapter = (bookId: string, from: number, to: number) => call<BookMeta>("chapter_move", { bookId, from, to });
export const deleteChapter = (bookId: string, chapterId: string) => call<BookMeta>("chapter_delete", { bookId, chapterId });
export const searchChapters = (bookId: string, q: string) => call<SearchHit[]>("chapter_search", { bookId, q });
export const chapterMarkdown = (bookId: string, chapterId: string) => call<string>("chapter_markdown", { bookId, chapterId });
