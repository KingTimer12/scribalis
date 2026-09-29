import * as api from "../../api/workspace";
import type { AreaNode } from "../../api/types";
import { currentDocKey } from "../../editor/bridge";
import { pad } from "../../lib/format";
import { chapterNumber, isContainer } from "../../lib/manuscript";
import { dropTarget, findNode, locate, type DropPos } from "../../lib/tree";
import { focusTarget } from "../focus";
import { cancelDocSave, flushAll, settleDocSave } from "../saving";
import { setState, state } from "../state";
import { expand } from "./expanded";
import { openFirstChapter, openNode } from "./open";
import { run as runAction } from "./run";
import { flash, flashError } from "./ui";

/** Where a new node (created or imported) lands: the selected folder, or the parent of the selected item. */
function parentForNewItem(): string | null {
  const sel = state.areaSel;
  if (!sel) return null;
  const node = findNode(state.area, sel);
  if (node && isContainer(node.kind)) return sel;
  return locate(state.area, sel)?.parent ?? null;
}

/** True when `target` is `id` or sits inside its subtree. */
function insideSubtree(root: AreaNode | null, id: string, target: string): boolean {
  return target === id || (!!root && !!findNode(root.children ?? [], target));
}

/** Runs a mutating tree action; a stale id reloads the tree instead of showing an error. */
const run = (fn: () => Promise<void>) =>
  runAction(fn, async (e) => {
    if (e !== "Item não encontrado") return false;
    await loadArea();
    return true;
  });

export async function loadArea() {
  const b = state.book;
  if (!b) return;
  try {
    const items = await api.areaTree(b.id);
    if (state.book?.id === b.id) setState("area", items);
  } catch (e) {
    flashError(e);
  }
}

/**
 * Creates a node in the selected folder (or at `at`). A chapter opens on its title; a folder
 * or text enters rename in the tree.
 */
export function createNode(kind: "folder" | "text" | "chapter", at?: { parent: string | null; index: number }) {
  const b = state.book;
  if (!b) return;
  const parent = at ? at.parent : parentForNewItem();
  const siblings = (parent ? findNode(state.area, parent)?.children : state.area) ?? [];
  const index = at ? at.index : siblings.length;
  const title = kind === "folder" ? "Nova pasta" : kind === "text" ? "Novo documento" : "";
  return run(async () => {
    const { id, items } = await api.areaCreate(b.id, parent, index, kind, title);
    setState({ area: items, areaSel: id, areaConfirm: null });
    if (parent) expand(parent);
    if (kind !== "chapter") return startNodeRename(id);
    await openNode(id, false);
    focusTarget("title", 0);
    flash("Capítulo " + pad(chapterNumber(state.area, id)) + " criado");
  });
}

export function startNodeRename(id: string) {
  const node = findNode(state.area, id);
  if (!node || node.kind === "manuscript") return;
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
    await flushAll();
    setState("area", await api.areaRename(b.id, id, val));
  });
}

/** Saves a node's notes; the UI calls this on change, so no debounce is needed here. */
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
    if (key && insideSubtree(node, id, key.docId)) cancelDocSave();
    setState("area", await api.areaDelete(b.id, id));
    if (state.areaSel && insideSubtree(node, id, state.areaSel)) setState("areaSel", null);
    if (state.areaOpen && insideSubtree(node, id, state.areaOpen)) await openFirstChapter();
  });
}

/** Delete with confirmation: the first request arms it and says how to confirm, the second deletes. */
export function requestDelete(id: string) {
  const node = findNode(state.area, id);
  if (!node) return;
  if (state.areaConfirm === id) return deleteNode(id);
  void deleteNode(id);
  flash("Aperte Delete de novo para excluir «" + node.title + "»");
}

/**
 * Moves `id` under `parent` at `index`. Across the Manuscrito's edge Rust converts text ⇄
 * chapter; when that changes the open node's kind, it is reopened in the right editor.
 */
export function moveTo(id: string, parent: string | null, index: number) {
  const b = state.book;
  if (!b) return;
  const openId = state.areaOpen;
  const openKind = openId ? findNode(state.area, openId)?.kind : undefined;
  return run(async () => {
    // Pending text lands under its current kind before the node changes kind.
    await flushAll();
    setState("area", await api.areaMove(b.id, id, parent, index));
    if (parent) expand(parent);
    const now = openId ? findNode(state.area, openId) : null;
    if (openId && now && now.kind !== openKind) {
      // Text typed during the move is filed by the node's new kind (see `saveDocNow`), then
      // the node reopens in the editor that matches it; nothing saves to the old path.
      await settleDocSave();
      setState("areaOpen", null);
      await openNode(openId, false);
    }
  });
}

/** Drag and drop in the tree. */
export function moveNode(dragId: string, targetId: string, pos: DropPos) {
  const target = dropTarget(state.area, dragId, targetId, pos);
  if (!target) return;
  return moveTo(dragId, target.parent, target.index);
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

export function openFile(id: string) {
  const b = state.book;
  if (!b) return;
  return run(() => api.areaOpenFile(b.id, id));
}
