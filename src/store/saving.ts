import * as bookApi from "../api/book";
import * as chapterApi from "../api/chapter";
import { statsToday } from "../api/prefs";
import type { BookPatch, ChapterPatch, DocJSON } from "../api/types";
import { saveAreaDoc } from "../api/workspace";
import { currentDocKey, getDoc, loadDoc, sameKey, type DocKey } from "../editor/bridge";
import { editBook, setState, state } from "./state";
import { flashError } from "./actions/ui";

const DOC_DELAY = 800;
const META_DELAY = 300;

interface Pending<P> {
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<unknown>;
  patch?: P;
}

let docSave: (Pending<never> & { key: DocKey }) | null = null;
let chapterPatch: Pending<ChapterPatch> | null = null;
let bookPatch: Pending<BookPatch> | null = null;

function target() {
  const b = state.book;
  const c = b?.chapters[b.cur];
  return b && c ? { bookId: b.id, chapterId: c.id } : null;
}

async function saveDocNow(key: DocKey) {
  // Null when the editor already holds another document: never file its text under `key`.
  const doc = getDoc(key);
  if (!doc) return;
  if (key.scope === "area") {
    await saveAreaDoc(key.bookId, key.docId, doc);
    return;
  }
  const saved = await chapterApi.saveChapter(key.bookId, key.docId, doc);
  editBook((b) => {
    const c = b.id === key.bookId ? b.chapters.find((x) => x.id === key.docId) : undefined;
    if (c) c.words = saved.words;
  });
  setState("today", (await statsToday()).today);
}

/** Runs the pending text save now, if any. */
async function flushDocSave() {
  const p = docSave;
  docSave = null;
  if (!p) return;
  clearTimeout(p.timer);
  await p.run();
}

/** Debounced save of the text of the document the editor holds. */
export function scheduleDocSave() {
  const key = currentDocKey();
  if (!key) return;
  if (docSave && !sameKey(docSave.key, key)) void flushDocSave();
  if (docSave) clearTimeout(docSave.timer);
  const run = () => saveDocNow(key).catch(flashError);
  docSave = { timer: setTimeout(() => { docSave = null; run(); }, DOC_DELAY), run, key };
}

export function cancelDocSave() {
  if (docSave) clearTimeout(docSave.timer);
  docSave = null;
}

/** Waits until no text save is pending (text typed meanwhile is saved too). */
export async function settleDocSave() {
  while (docSave) await flushDocSave();
}

/**
 * Loads document `key` into the editor. Text typed into the old document since the
 * last flush (e.g. during the IPC that fetched `doc`) is saved to the old document
 * first, while the editor still shows it. `apply` runs right before the swap, to
 * publish the matching store state; returning false aborts the swap.
 * Resolves to whether the document was loaded.
 */
export async function swapDocument(doc: DocJSON, key: DocKey, apply: () => boolean | void): Promise<boolean> {
  await settleDocSave();
  if (apply() === false) return false;
  cancelDocSave();
  loadDoc(doc, key);
  return true;
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
