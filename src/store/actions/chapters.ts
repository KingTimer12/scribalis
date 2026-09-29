import * as api from "../../api/chapter";
import { statsToday } from "../../api/prefs";
import type { Created, DocJSON, Status } from "../../api/types";
import { areaMove } from "../../api/workspace";
import { liveText, type DocKey } from "../../editor/bridge";
import { STATUS, STATUS_LABEL } from "../../lib/constants";
import { docWords } from "../../lib/doc";
import { pad, wc } from "../../lib/format";
import { chapterNumber } from "../../lib/manuscript";
import { findNode, locate } from "../../lib/tree";
import { focusTarget } from "../focus";
import { cancelDocSave, flushAll, scheduleChapterPatch, scheduleDocSave, swapDocument } from "../saving";
import { currentChapter } from "../selectors/book";
import { editNode, setState, state } from "../state";
import { run } from "./run";
import { flash, flashError } from "./ui";
import { createNode } from "./workspace";

export async function refreshToday() {
  setState("today", (await statsToday()).today);
}

/** Enter ×3 from the editor: the text after the caret opens a new chapter right below, in the same folder. */
export function splitCurrent(before: DocJSON, after: DocJSON) {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return;
  // The split itself persists both halves of the current text.
  cancelDocSave();
  return run(async () => {
    await flushAll();
    let created: Created;
    try {
      created = await api.splitChapter(b.id, c.id, before, after);
    } catch (e) {
      // Nothing was split: the editor still holds the whole text, save it as usual.
      scheduleDocSave();
      throw e;
    }
    const { id, items } = created;
    const key: DocKey = { bookId: b.id, docId: id, scope: "chapter" };
    const shown = await swapDocument(after, key, () => {
      if (state.book?.id !== b.id) return false;
      setState({ area: items, areaOpen: id, areaSel: id, liveWords: docWords(after), tripleHint: false });
      setState("book", "open", id);
    });
    if (!shown) return;
    focusTarget("title", 0);
    await refreshToday();
    flash("Capítulo " + pad(chapterNumber(state.area, id)) + " criado" + (after.content.length ? " — o texto seguinte foi junto" : ""));
  });
}

/** A new empty chapter right after the open one, in the same folder. */
export function newChapterAfterCurrent() {
  const c = currentChapter();
  const loc = c ? locate(state.area, c.id) : null;
  if (!loc) return;
  return createNode("chapter", { parent: loc.parent, index: loc.index + 1 });
}

export function setStatus(id: string, status: Status) {
  const b = state.book;
  if (!b) return;
  editNode(id, (n) => (n.status = status));
  api.updateChapter(b.id, id, { status }).catch(flashError);
  flash("Status: " + STATUS_LABEL[status]);
}

export function cycleStatus() {
  const c = currentChapter();
  if (!c) return;
  const cur = c.status ?? "rascunho";
  setStatus(c.id, STATUS[(STATUS.indexOf(cur) + 1) % STATUS.length]);
}

/** Alt Shift ↑ / ↓: moves the open chapter one place among its siblings. */
export function moveChapterStep(dir: -1 | 1) {
  const b = state.book;
  const c = currentChapter();
  const loc = c ? locate(state.area, c.id) : null;
  if (!b || !c || !loc) return;
  const siblings = (loc.parent ? findNode(state.area, loc.parent)?.children : state.area) ?? [];
  const to = loc.index + dir;
  if (to < 0 || to >= siblings.length) {
    flash(dir < 0 ? "Já é o primeiro desta pasta" : "Já é o último desta pasta");
    return;
  }
  return run(async () => {
    await flushAll();
    setState("area", await areaMove(b.id, c.id, loc.parent, to));
    flash("Agora é o capítulo " + pad(chapterNumber(state.area, c.id)));
  });
}

/** "Copiar para publicar": the heading plus the markdown of chapter `id` (the open one by default). */
export async function copyChapter(id = currentChapter()?.id) {
  const b = state.book;
  if (!b || !id) return;
  try {
    await flushAll();
    await navigator.clipboard.writeText(await api.chapterMarkdown(b.id, id));
    flash("Capítulo copiado");
  } catch {
    flash("Não foi possível copiar aqui");
  }
}

export function setChapterTitle(title: string) {
  const c = currentChapter();
  if (!c) return;
  editNode(c.id, (n) => (n.title = title));
  scheduleChapterPatch({ title });
}

export function setChapterNotes(notes: string) {
  const c = currentChapter();
  if (!c) return;
  editNode(c.id, (n) => (n.notes = notes));
  scheduleChapterPatch({ notes });
}

/** Called by the chapter editor on every change: live count + debounced save. */
export function onEditorChange() {
  setState("liveWords", wc(liveText()));
  scheduleDocSave();
}
