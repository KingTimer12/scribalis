import * as api from "../../api/workspace";
import type { AreaNode } from "../../api/types";
import { currentDocKey, type DocKey } from "../../editor/bridge";
import { focusTarget } from "../focus";
import { dropTarget, findNode, locate, type DropPos } from "../../lib/tree";
import { pad } from "../../lib/format";
import { cancelDocSave, flushAll, swapDocument } from "../saving";
import { setState, state } from "../state";
import { flash, flashError } from "./ui";

function expandedKey(bookId: string) {
  return "area-expanded:" + bookId;
}

/** Reads which folders were expanded for this book; never throws (private mode, quota, ...). */
function loadExpanded(bookId: string): string[] {
  try {
    const raw = localStorage.getItem(expandedKey(bookId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function setExpanded(bookId: string, expanded: string[]) {
  setState("areaExpanded", expanded);
  try {
    localStorage.setItem(expandedKey(bookId), JSON.stringify(expanded));
  } catch {
    // ignore: nothing worth surfacing to the user over a remembered UI preference
  }
}

/** Runs a mutating workspace action; a stale id reloads the tree instead of showing an error. */
async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (e === "Item não encontrado") {
      await loadArea();
      return;
    }
    flashError(e);
  }
}

/** The parent under which a new node (created or imported) should land: the selected folder, or the parent of the selected item. */
function parentForNewItem(): string | null {
  const sel = state.areaSel;
  if (!sel) return null;
  const node = findNode(state.area, sel);
  if (node?.kind === "folder") return sel;
  return locate(state.area, sel)?.parent ?? null;
}

/** True when `id` is the deleted/promoted node, or sits inside its subtree. */
function insideSubtree(root: AreaNode | null, id: string, target: string): boolean {
  return target === id || (!!root && !!findNode(root.children ?? [], target));
}

export async function loadArea() {
  const b = state.book;
  if (!b) return;
  try {
    const items = await api.areaTree(b.id);
    setState({ area: items, areaExpanded: loadExpanded(b.id) });
  } catch (e) {
    flashError(e);
  }
}

export function selectNode(id: string) {
  setState("areaSel", id);
}

export function openNode(id: string) {
  const b = state.book;
  const node = findNode(state.area, id);
  if (!b || !node) return;
  setState("areaSel", id);
  if (node.kind === "folder") return toggleExpanded(id);
  if (node.kind !== "text") {
    setState("areaOpen", id);
    return;
  }
  return run(async () => {
    await flushAll();
    const doc = await api.loadAreaDoc(b.id, id);
    const key: DocKey = { bookId: b.id, docId: id, scope: "area" };
    if (await swapDocument(doc, key, () => setState("areaOpen", id))) focusTarget("body", "end");
  });
}

export function toggleExpanded(id: string) {
  const b = state.book;
  if (!b) return;
  const set = new Set(state.areaExpanded);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  setExpanded(b.id, [...set]);
}

export function createNode(kind: "folder" | "text") {
  const b = state.book;
  if (!b) return;
  const parent = parentForNewItem();
  const siblings = (parent ? findNode(state.area, parent)?.children : state.area) ?? [];
  const index = siblings.length;
  const title = kind === "folder" ? "Nova pasta" : "Novo documento";
  return run(async () => {
    const { id, items } = await api.areaCreate(b.id, parent, index, kind, title);
    setState("area", items);
    if (parent && !state.areaExpanded.includes(parent)) setExpanded(b.id, [...state.areaExpanded, parent]);
    startNodeRename(id);
  });
}

export function startNodeRename(id: string) {
  const node = findNode(state.area, id);
  if (!node) return;
  setState({ areaRenaming: id, areaRenameVal: node.title });
}

export function cancelNodeRename() {
  setState({ areaRenaming: null, areaRenameVal: "" });
}

export function commitNodeRename() {
  const b = state.book;
  const id = state.areaRenaming;
  const val = state.areaRenameVal.trim();
  setState({ areaRenaming: null, areaRenameVal: "" });
  if (!b || !id || !val) return;
  return run(async () => {
    setState("area", await api.areaRename(b.id, id, val));
  });
}

/** Saves a node's notes; the UI calls this on blur, so no debounce is needed here. */
export function setNodeNotes(id: string, notes: string) {
  const b = state.book;
  const node = findNode(state.area, id);
  if (!b || !node || node.notes === notes) return;
  return run(async () => {
    setState("area", await api.areaSetNotes(b.id, id, notes));
  });
}

export function deleteNode(id: string) {
  if (state.areaConfirm !== id) {
    setState("areaConfirm", id);
    return;
  }
  const b = state.book;
  if (!b) return;
  setState("areaConfirm", null);
  const node = findNode(state.area, id);
  return run(async () => {
    await flushAll();
    const key = currentDocKey();
    if (key && key.scope === "area" && insideSubtree(node, id, key.docId)) cancelDocSave();
    setState("area", await api.areaDelete(b.id, id));
    if (state.areaOpen && insideSubtree(node, id, state.areaOpen)) setState("areaOpen", null);
    if (state.areaSel && insideSubtree(node, id, state.areaSel)) setState("areaSel", null);
  });
}

export function moveNode(dragId: string, targetId: string, pos: DropPos) {
  const b = state.book;
  if (!b) return;
  const target = dropTarget(state.area, dragId, targetId, pos);
  if (!target) return;
  return run(async () => {
    setState("area", await api.areaMove(b.id, dragId, target.parent, target.index));
  });
}

export function addFiles() {
  const b = state.book;
  if (!b) return;
  const parent = parentForNewItem();
  return run(async () => {
    const items = await api.areaPickFiles(b.id, parent);
    if (items) setState("area", items);
  });
}

export function sendToChapter(id: string) {
  const b = state.book;
  if (!b) return;
  const node = findNode(state.area, id);
  return run(async () => {
    await flushAll();
    const key = currentDocKey();
    if (key && key.scope === "area" && key.docId === id) cancelDocSave();
    const { book, items } = await api.areaToChapter(b.id, id);
    setState("area", items);
    if (state.areaOpen && insideSubtree(node, id, state.areaOpen)) setState("areaOpen", null);
    if (state.areaSel && insideSubtree(node, id, state.areaSel)) setState("areaSel", null);
    if (state.book?.id !== book.id) return;
    setState("book", book);
    flash("Enviado para os capítulos como capítulo " + pad(book.chapters.length));
  });
}

export function openFile(id: string) {
  const b = state.book;
  if (!b) return;
  return run(() => api.areaOpenFile(b.id, id));
}
