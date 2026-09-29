import { batch } from "solid-js";
import * as bookApi from "../../api/book";
import * as api from "../../api/library";
import { statsToday } from "../../api/prefs";
import { areaTree } from "../../api/workspace";
import { docWords } from "../../lib/doc";
import { focusTarget } from "../focus";
import { expandedFor } from "./expanded";
import { initialNode, keyOf, loadNodeDoc } from "./open";
import { backupAuto, fetchComments, loadBookCloud, syncCloudBadges } from "./cloud";
import { flushAll, settleDocSave, swapDocument } from "../saving";
import { sortedLibrary } from "../selectors/library";
import { session, setState, state } from "../state";
import { flash, flashError } from "./ui";

export async function refreshLibrary() {
  try {
    const { books, warnings } = await api.listLibrary();
    setState({ library: books, ready: true });
    setState("today", (await statsToday()).today);
    if (warnings.length) flash(warnings.join(" · "));
  } catch (e) {
    setState("ready", true);
    flashError(e);
  }
}

export async function openBook(id: string, target: "title" | "body" = "body") {
  const prev = state.book?.id;
  try {
    await flushAll();
    const book = await bookApi.openBook(id);
    const items = await areaTree(id);
    const node = initialNode(items, book.open);
    const key = node ? keyOf(id, node) : null;
    const doc = node && key ? await loadNodeDoc(id, node) : null;
    const apply = () =>
      batch(() => {
        setState({
          book, curId: id, view: "book", panel: null, q: "", tripleHint: false, focus: false,
          libConfirm: null, renaming: null, liveWords: node?.kind === "chapter" && doc ? docWords(doc) : 0,
          // the tree's screen state belongs to the previous book
          area: items, areaExpanded: expandedFor(id, items, node?.id ?? null), areaSel: node?.id ?? null,
          areaOpen: node?.id ?? null, areaRenaming: null, areaRenameVal: "", areaConfirm: null,
        });
      });
    if (doc && key) await swapDocument(doc, key, apply);
    else {
      // Nothing to load into the editor: land pending text before it unmounts.
      await settleDocSave();
      apply();
    }
    if (prev && prev !== id) backupAuto(prev);
    setState("cloudBook", null);
    void loadBookCloud(id).then((view) => {
      if (view?.enabled) void fetchComments(true);
    });
    if (target === "title" && node?.kind === "chapter") focusTarget("title", 0);
    else focusTarget(doc ? "body" : "tree", doc ? "end" : null);
  } catch (e) {
    flashError(e);
  }
}

export async function goLibrary() {
  const prev = state.book?.id;
  await flushAll();
  await refreshLibrary();
  // Text typed while the library loaded: save it before the editor unmounts.
  await settleDocSave();
  const idx = Math.max(0, sortedLibrary().findIndex((b) => b.id === state.curId));
  focusTarget("lib");
  setState({
    view: "library", book: null, panel: null, focus: false, libSel: idx, libQ: "",
    libConfirm: null, renaming: null, tripleHint: false,
  });
  if (prev) backupAuto(prev);
  setState("cloudBook", null);
  void syncCloudBadges();
}

export function startNew() {
  session.newId = "n" + Date.now().toString(36);
  focusTarget("rename", 0);
  setState({ view: "library", panel: null, renaming: "new", renameVal: "", libConfirm: null });
}

export function startRename(id: string) {
  const b = state.library.find((x) => x.id === id);
  if (!b) return;
  focusTarget("rename", "end");
  setState({ renaming: id, renameVal: b.title, libConfirm: null });
}

export function cancelRename() {
  focusTarget("lib");
  setState({ renaming: null, renameVal: "" });
}

export async function commitRename() {
  const val = state.renameVal.trim();
  const renaming = state.renaming;
  setState({ renaming: null, renameVal: "" });
  try {
    if (renaming === "new") {
      const created = await api.createBook(val || "Obra sem título");
      await refreshLibrary();
      await openBook(created.id, "title");
      flash("Obra criada — escreva o título do capítulo 01");
      return;
    }
    if (!renaming || !val) return cancelRename();
    await api.renameBook(renaming, val);
    await refreshLibrary();
    focusTarget("lib");
    setState("libSel", 0);
    flash("Obra renomeada");
  } catch (e) {
    flashError(e);
  }
}

export async function deleteBook(id: string) {
  const gone = state.library.find((b) => b.id === id);
  try {
    await api.deleteBook(id);
    await refreshLibrary();
    focusTarget("lib");
    setState({
      curId: state.curId === id ? null : state.curId,
      libConfirm: null,
      libSel: Math.max(0, Math.min(state.libSel, state.library.length - 1)),
    });
    flash('"' + (gone ? gone.title : "Obra") + '" excluída');
  } catch (e) {
    flashError(e);
  }
}

export async function restoreSamples() {
  try {
    const { books } = await api.restoreSamples();
    focusTarget("lib");
    setState({ library: books, libSel: 0 });
    flash("Exemplos restaurados");
  } catch (e) {
    flashError(e);
  }
}
