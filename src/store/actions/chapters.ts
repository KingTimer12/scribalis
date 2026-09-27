import * as bookApi from "../../api/book";
import * as api from "../../api/chapter";
import { statsToday } from "../../api/prefs";
import type { BookMeta, DocJSON } from "../../api/types";
import { liveText, loadDoc } from "../../editor/bridge";
import { STATUS, STATUS_LABEL } from "../../lib/constants";
import { docWords } from "../../lib/doc";
import { pad, wc } from "../../lib/format";
import { focusTarget, type Caret } from "../focus";
import { cancelChapterSave, flushAll, scheduleChapterPatch, scheduleChapterSave } from "../saving";
import { currentChapter } from "../selectors/book";
import { editBook, setState, state } from "../state";
import { flash, flashError } from "./ui";

/** Where focus lands after showing a chapter: the title, or a caret in the text. */
type Target = Caret | "title";

export async function refreshToday() {
  setState("today", (await statsToday()).today);
}

/** Applies new book metadata and loads its current chapter into the editor. */
async function showCurrent(meta: BookMeta, target: Target) {
  const chapter = meta.chapters[meta.cur];
  const doc = await api.loadChapter(meta.id, chapter.id);
  setState({ book: meta, tripleHint: false, liveWords: docWords(doc) });
  loadDoc(doc);
  if (target === "title") focusTarget("title", 0);
  else focusTarget("body", target);
}

async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    flashError(e);
  }
}

export function goChapter(i: number, caret: Target = "end") {
  const b = state.book;
  if (!b) return;
  if (i < 0 || i >= b.chapters.length) {
    flash(i < 0 ? "Este é o primeiro capítulo" : "Este é o último capítulo");
    return;
  }
  return run(async () => {
    await flushAll();
    const meta = await bookApi.updateBook(b.id, { cur: i });
    await showCurrent(meta, caret);
  });
}

export function insertChapterAt(at: number) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    await showCurrent(await api.insertChapter(b.id, at), "title");
    flash("Capítulo " + pad(at + 1) + " criado");
  });
}

/** Enter ×3 from the editor. */
export function splitCurrent(before: DocJSON, after: DocJSON) {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  cancelChapterSave();
  return run(async () => {
    await flushAll();
    const meta = await api.splitChapter(b.id, c.id, before, after);
    setState({ book: meta, tripleHint: false, liveWords: docWords(after) });
    loadDoc(after);
    focusTarget("title", 0);
    await refreshToday();
    flash("Capítulo " + pad(meta.cur + 1) + " criado" + (after.content.length ? " — o texto seguinte foi junto" : ""));
  });
}

/** Swaps chapter `from` with its neighbor. Resolves to the new index, or null. */
export async function moveChapter(from: number, dir: -1 | 1): Promise<number | null> {
  const b = state.book;
  const to = from + dir;
  if (!b || to < 0 || to >= b.chapters.length) return null;
  try {
    await flushAll();
    setState("book", await api.moveChapter(b.id, from, to));
    flash("Movido para a posição " + pad(to + 1));
    return to;
  } catch (e) {
    flashError(e);
    return null;
  }
}

export function cycleStatus() {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  const next = STATUS[(STATUS.indexOf(c.status) + 1) % STATUS.length];
  editBook((bk) => (bk.chapters[bk.cur].status = next));
  api.updateChapter(b.id, c.id, { status: next }).catch(flashError);
  flash("Status: " + STATUS_LABEL[next]);
}

export function deleteCurrentChapter() {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  if (b.chapters.length === 1) return flash("A obra precisa de pelo menos um capítulo");
  const gone = b.cur;
  cancelChapterSave();
  return run(async () => {
    await flushAll();
    await showCurrent(await api.deleteChapter(b.id, c.id), "end");
    await refreshToday();
    flash("Capítulo " + pad(gone + 1) + " excluído");
  });
}

export async function copyCurrentChapter() {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  try {
    await flushAll();
    await navigator.clipboard.writeText(await api.chapterMarkdown(b.id, c.id));
    flash("Capítulo copiado");
  } catch {
    flash("Não foi possível copiar aqui");
  }
}

export function setChapterTitle(title: string) {
  editBook((b) => (b.chapters[b.cur].title = title));
  scheduleChapterPatch({ title });
}

export function setChapterNotes(notes: string) {
  editBook((b) => (b.chapters[b.cur].notes = notes));
  scheduleChapterPatch({ notes });
}

export function openFromIndex(i: number) {
  setState("panel", null);
  return goChapter(i);
}

/** Called by the editor on every change: live count + debounced save. */
export function onEditorChange() {
  setState("liveWords", wc(liveText()));
  scheduleChapterSave();
}
