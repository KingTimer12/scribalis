import * as bookApi from "../api/book";
import * as chapterApi from "../api/chapter";
import { statsToday } from "../api/prefs";
import type { BookPatch, ChapterPatch } from "../api/types";
import { getDoc } from "../editor/bridge";
import { editBook, setState, state } from "./state";
import { flashError } from "./actions/ui";

const DOC_DELAY = 800;
const META_DELAY = 300;

interface Pending<P> {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<unknown>;
  patch?: P;
}

let docSave: Pending<never> | null = null;
let chapterPatch: Pending<ChapterPatch> | null = null;
let bookPatch: Pending<BookPatch> | null = null;

function target() {
  const b = state.book;
  const c = b?.chapters[b.cur];
  return b && c ? { bookId: b.id, chapterId: c.id } : null;
}

async function saveDocNow(bookId: string, chapterId: string) {
  const doc = getDoc();
  if (!doc) return;
  const saved = await chapterApi.saveChapter(bookId, chapterId, doc);
  editBook((b) => {
    const c = b.id === bookId ? b.chapters.find((x) => x.id === chapterId) : undefined;
    if (c) c.words = saved.words;
  });
  setState("today", (await statsToday()).today);
}

/** Debounced save of the open chapter's text. */
export function scheduleChapterSave() {
  const t = target();
  if (!t) return;
  if (docSave) clearTimeout(docSave.timer);
  const run = () => saveDocNow(t.bookId, t.chapterId).catch(flashError);
  docSave = { timer: setTimeout(() => { docSave = null; run(); }, DOC_DELAY), run };
}

export function cancelChapterSave() {
  if (docSave) clearTimeout(docSave.timer);
  docSave = null;
}

/** Debounced title/notes update; successive patches merge. */
export function scheduleChapterPatch(patch: ChapterPatch) {
  const t = target();
  if (!t) return;
  const merged = { ...(chapterPatch?.patch ?? {}), ...patch };
  if (chapterPatch) clearTimeout(chapterPatch.timer);
  const run = () => chapterApi.updateChapter(t.bookId, t.chapterId, merged).catch(flashError);
  chapterPatch = { timer: setTimeout(() => { chapterPatch = null; run(); }, META_DELAY), run, patch: merged };
}

/** Debounced book title/author update. */
export function scheduleBookPatch(patch: BookPatch) {
  const id = state.book?.id;
  if (!id) return;
  const merged = { ...(bookPatch?.patch ?? {}), ...patch };
  if (bookPatch) clearTimeout(bookPatch.timer);
  const run = () => bookApi.updateBook(id, merged).catch(flashError);
  bookPatch = { timer: setTimeout(() => { bookPatch = null; run(); }, META_DELAY), run, patch: merged };
}

/** Runs every pending save now. Call before switching chapter/book or closing. */
export async function flushAll() {
  const all: (Pending<unknown> | null)[] = [docSave, chapterPatch, bookPatch];
  const pending = all.filter((p): p is Pending<unknown> => !!p);
  docSave = chapterPatch = bookPatch = null;
  for (const p of pending) clearTimeout(p.timer);
  await Promise.all(pending.map((p) => p.run()));
}
