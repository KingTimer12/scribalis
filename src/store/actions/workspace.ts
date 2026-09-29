import * as api from "../../api/workspace";
import type { AreaNode } from "../../api/types";
import { currentDocKey } from "../../editor/bridge";
import { pad, plural } from "../../lib/format";
import { chapterNumber, descendantCount, displayTitle, inManuscript } from "../../lib/manuscript";
import { dropTarget, findNode, isContainer, locate, manuscriptOf, type DropPos } from "../../lib/tree";
import { askConfirm } from "../confirm";
import { focusTarget } from "../focus";
import { cancelDocSave, flushAll, holdDocSaves, registerFlusher, releaseDocSaves, settleDocSave } from "../saving";
import { editNode, setState, state } from "../state";
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
    setState({ area: items, areaSel: id });
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

// The book is bound when the notes are typed: a book switch before the flush must not redirect them.
let pendingNotes: { bookId: string; id: string; notes: string; timer: ReturnType<typeof setTimeout> } | null = null;

/** Notes typed into a free text: shown at once, saved a moment later (or by `flushNodeNotes`). */
export function scheduleNodeNotes(id: string, notes: string) {
  const bookId = state.book?.id;
  if (!bookId) return;
  if (pendingNotes && (pendingNotes.id !== id || pendingNotes.bookId !== bookId)) void flushNodeNotes();
  if (pendingNotes) clearTimeout(pendingNotes.timer);
  editNode(id, (n) => (n.notes = notes));
  pendingNotes = { bookId, id, notes, timer: setTimeout(() => void flushNodeNotes(), 300) };
}

/** Saves the pending notes now, if any. The drawer calls it on close and `flushAll` on window close. */
export function flushNodeNotes() {
  const p = pendingNotes;
  pendingNotes = null;
  if (!p) return;
  clearTimeout(p.timer);
  // The tree already shows the text: only the write is left.
  return run(async () => {
    await api.areaSetNotes(p.bookId, p.id, p.notes);
  });
}
registerFlusher(flushNodeNotes);

/** Deletes the node for good (no question asked: `requestDelete` is the user-facing entry). */
export function deleteNode(id: string) {
  // The Manuscrito cannot be deleted.
  if (findNode(state.area, id)?.kind === "manuscript") return;
  const b = state.book;
  if (!b) return;
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

/** Delete with a confirmation dialog; the Manuscrito only gets a message. */
export async function requestDelete(id: string) {
  const node = findNode(state.area, id);
  if (!node) return;
  if (node.kind === "manuscript") return flash("O Manuscrito não pode ser excluído.");
  const inside = descendantCount(node);
  const message = isContainer(node.kind)
    ? inside
      ? "A pasta e os " + plural(inside, "item", "itens") + " dentro dela serão excluídos."
      : "A pasta vazia será excluída."
    : node.kind === "chapter"
      ? "O capítulo e o texto dele serão excluídos."
      : node.kind === "text"
        ? "O texto será excluído."
        : "O arquivo será excluído.";
  const ok = await askConfirm({
    title: "Excluir “" + displayTitle(state.area, node) + "”?",
    message,
    confirmLabel: "Excluir",
    danger: true,
  });
  if (ok) await deleteNode(id);
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
    // Pending text lands under its current kind before the node changes kind; typing during
    // the move is only marked dirty (saves are held) until the tree knows the node's final kind.
    await flushAll();
    holdDocSaves();
    try {
      setState("area", await api.areaMove(b.id, id, parent, index));
      if (parent) expand(parent);
    } finally {
      // Moved or refused, the tree now holds the kind the node really has: held text is
      // scheduled again and lands under it.
      releaseDocSaves();
    }
    const now = openId ? findNode(state.area, openId) : null;
    if (openId && now && now.kind !== openKind) {
      // Write the held text under the new kind before the reload, or it would be discarded.
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

/** "Mover para o Manuscrito": the text becomes the last chapter. */
export async function moveIntoManuscript(id: string) {
  const m = manuscriptOf(state.area);
  if (!m) return;
  await moveTo(id, m.id, m.children?.length ?? 0);
  if (findNode(state.area, id)?.kind === "chapter") flash("Agora é o capítulo " + pad(chapterNumber(state.area, id)));
}

/** "Mover para fora do Manuscrito": the chapter becomes a text at the end of the tree. */
export async function moveOutOfManuscript(id: string) {
  const title = findNode(state.area, id)?.title.trim() || "Sem título";
  await moveTo(id, null, state.area.length);
  if (findNode(state.area, id)?.kind === "text") flash("«" + title + "» saiu do Manuscrito");
}

export function addFiles() {
  const b = state.book;
  if (!b) return;
  // Images and attachments cannot enter the Manuscrito: from inside it they go to the root.
  const parent = state.areaSel && inManuscript(state.area, state.areaSel) ? null : parentForNewItem();
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
