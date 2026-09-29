import type { AreaNode, Created, DocJSON, NodeKind } from "../types";
import { inManuscript, isContainer, manuscriptWords } from "../../lib/manuscript";
import { db, EMPTY, findBook, mockId, touch } from "./db";
import { checkCreate, checkDelete, checkMove, checkRename, convert, NO_MEDIA, rootIndex } from "./manuscript";

// Local tree mutations mirroring the Rust `model::workspace`, `model::manuscript` and
// `ops::manuscript` modules: same messages and move semantics, so the mock behaves like the
// desktop app in `bun run dev` and tests.

function notFound(): never {
  throw "Item não encontrado";
}

function find(items: AreaNode[], id: string): AreaNode | undefined {
  for (const node of items) {
    if (node.id === id) return node;
    const found = find(node.children ?? [], id);
    if (found) return found;
  }
  return undefined;
}

function remove(items: AreaNode[], id: string): AreaNode | undefined {
  const i = items.findIndex((node) => node.id === id);
  if (i >= 0) return items.splice(i, 1)[0];
  for (const node of items) {
    if (!node.children) continue;
    const found = remove(node.children, id);
    if (found) return found;
  }
  return undefined;
}

/** Inserts `node` under `parent` (root when null) at `index`, like Rust's `workspace::insert`. */
export function insertNode(items: AreaNode[], parent: string | null, index: number, node: AreaNode) {
  let list = items;
  if (parent) {
    const p = find(items, parent);
    if (!p) notFound();
    if (!isContainer(p.kind)) throw "Só dá para guardar itens dentro de pastas";
    p.children ??= [];
    list = p.children;
  }
  list.splice(Math.min(index, list.length), 0, node);
}

/** Moves `id` under `parent` at `index` (position after taking the node out). */
function moveNode(items: AreaNode[], id: string, parent: string | null, index: number) {
  const node = find(items, id);
  if (!node) notFound();
  if (parent) {
    if (parent === id || find(node.children ?? [], parent)) throw "Não dá para mover uma pasta para dentro dela mesma";
    const p = find(items, parent);
    if (!p) notFound();
    if (!isContainer(p.kind)) throw "Só dá para guardar itens dentro de pastas";
  }
  const removed = remove(items, id);
  if (!removed) notFound();
  insertNode(items, parent, index, removed);
}

/** A node's id and all its descendants'. */
function subtreeIds(node: AreaNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(subtreeIds)];
}

function textNode(items: AreaNode[], id: string): AreaNode {
  const node = find(items, id);
  if (!node) notFound();
  if (node.kind !== "text") throw "Este item não é um texto";
  return node;
}

type Ids = { bookId: string; id: string };

export const workspace = {
  workspace_tree: ({ bookId }: { bookId: string }): AreaNode[] => findBook(bookId).area,

  workspace_create: (
    { bookId, parent, index, kind, title }: { bookId: string; parent: string | null; index: number; kind: NodeKind; title: string },
  ): Created => {
    const b = findBook(bookId);
    if (parent && !find(b.area, parent)) notFound();
    checkCreate(b.area, kind, parent);
    const id = mockId();
    let node: AreaNode;
    if (kind === "folder") node = { id, kind, title, notes: "" };
    else if (kind === "text") node = { id, kind, title, notes: "", file: id + ".md" };
    else if (kind === "chapter") node = { id, kind, title, notes: "", file: "capitulos/" + id + ".md", status: "rascunho", words: 0 };
    else throw 'Use "Adicionar arquivos" para imagens e anexos';
    if (kind !== "folder") b.docs[id] = structuredClone(EMPTY);
    insertNode(b.area, parent, rootIndex(b.area, parent, index), node);
    touch(b);
    return { id, items: b.area };
  },

  workspace_rename: ({ bookId, id, title }: Ids & { title: string }): AreaNode[] => {
    const b = findBook(bookId);
    checkRename(b.area, id);
    const node = find(b.area, id);
    if (!node) notFound();
    node.title = title;
    touch(b);
    return b.area;
  },

  workspace_set_notes: ({ bookId, id, notes }: Ids & { notes: string }): AreaNode[] => {
    const b = findBook(bookId);
    const node = find(b.area, id);
    if (!node) notFound();
    node.notes = notes;
    touch(b);
    return b.area;
  },

  workspace_move: ({ bookId, id, parent, index }: Ids & { parent: string | null; index: number }): AreaNode[] => {
    const b = findBook(bookId);
    checkMove(b.area, id, parent, index);
    const wasInside = inManuscript(b.area, id);
    const landsInside = !!parent && inManuscript(b.area, parent);
    const before = manuscriptWords(b.area);
    moveNode(b.area, id, parent, index);
    if (wasInside !== landsInside) convert(b, find(b.area, id)!, landsInside);
    // Moved, neither typed nor erased: today's count stays (Rust's `absorb` / `release`).
    db.base += manuscriptWords(b.area) - before;
    touch(b);
    return b.area;
  },

  workspace_delete: ({ bookId, id }: Ids): AreaNode[] => {
    const b = findBook(bookId);
    checkDelete(b.area, id);
    const removed = remove(b.area, id);
    if (!removed) notFound();
    for (const nid of subtreeIds(removed)) delete b.docs[nid];
    touch(b);
    return b.area;
  },

  workspace_load_doc: ({ bookId, id }: Ids): DocJSON => {
    const b = findBook(bookId);
    textNode(b.area, id);
    return b.docs[id] ?? EMPTY;
  },

  workspace_save_doc: ({ bookId, id, doc }: Ids & { doc: DocJSON }): void => {
    const b = findBook(bookId);
    textNode(b.area, id);
    b.docs[id] = structuredClone(doc);
    touch(b);
  },

  // No file system in the browser: mirrors the desktop-only guard in `commands::workspace`.
  workspace_pick_files: ({ bookId, parent }: { bookId: string; parent: string | null }): AreaNode[] | null => {
    if (parent && inManuscript(findBook(bookId).area, parent)) throw NO_MEDIA;
    throw "Adicionar arquivos só funciona no app desktop";
  },
  workspace_open_file: (_: Ids): void => {
    throw "Abrir arquivos só funciona no app desktop";
  },
};
