import type { AreaNode, Created, DocJSON, NodeKind, ToChapterResult } from "../types";
import { chapter as newChapter, findBook, mockId, toMeta, touch } from "./db";

// Local tree mutations mirroring the Rust `model::workspace` module (src-tauri/src/model/workspace.rs):
// same messages and move semantics, so the mock behaves like the desktop app in `bun run dev` and tests.

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

function insert(items: AreaNode[], parent: string | null, index: number, node: AreaNode) {
  let list = items;
  if (parent) {
    const p = find(items, parent);
    if (!p) notFound();
    if (p.kind !== "folder") throw "Só dá para guardar itens dentro de pastas";
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
    if (p.kind !== "folder") throw "Só dá para guardar itens dentro de pastas";
  }
  const removed = remove(items, id);
  if (!removed) notFound();
  insert(items, parent, index, removed);
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
  workspace_tree: ({ bookId }: { bookId: string }): AreaNode[] => structuredClone(findBook(bookId).area),

  workspace_create: (
    { bookId, parent, index, kind, title }: { bookId: string; parent: string | null; index: number; kind: NodeKind; title: string },
  ): Created => {
    const b = findBook(bookId);
    if (kind !== "folder" && kind !== "text") throw 'Use "Adicionar arquivos" para imagens e anexos';
    const id = mockId();
    const node: AreaNode = kind === "folder" ? { id, kind, title, notes: "" } : { id, kind, title, notes: "", file: id + ".md" };
    if (kind === "text") b.areaDocs[id] = { type: "doc", content: [] };
    insert(b.area, parent, index, node);
    touch(b);
    return { id, items: structuredClone(b.area) };
  },

  workspace_rename: ({ bookId, id, title }: Ids & { title: string }): AreaNode[] => {
    const b = findBook(bookId);
    const node = find(b.area, id);
    if (!node) notFound();
    node.title = title;
    touch(b);
    return structuredClone(b.area);
  },

  workspace_set_notes: ({ bookId, id, notes }: Ids & { notes: string }): AreaNode[] => {
    const b = findBook(bookId);
    const node = find(b.area, id);
    if (!node) notFound();
    node.notes = notes;
    touch(b);
    return structuredClone(b.area);
  },

  workspace_move: ({ bookId, id, parent, index }: Ids & { parent: string | null; index: number }): AreaNode[] => {
    const b = findBook(bookId);
    moveNode(b.area, id, parent, index);
    touch(b);
    return structuredClone(b.area);
  },

  workspace_delete: ({ bookId, id }: Ids): AreaNode[] => {
    const b = findBook(bookId);
    const removed = remove(b.area, id);
    if (!removed) notFound();
    for (const nid of subtreeIds(removed)) delete b.areaDocs[nid];
    touch(b);
    return structuredClone(b.area);
  },

  workspace_load_doc: ({ bookId, id }: Ids): DocJSON => {
    const b = findBook(bookId);
    textNode(b.area, id);
    return structuredClone(b.areaDocs[id] ?? { type: "doc", content: [] });
  },

  workspace_save_doc: ({ bookId, id, doc }: Ids & { doc: DocJSON }): void => {
    const b = findBook(bookId);
    textNode(b.area, id);
    b.areaDocs[id] = structuredClone(doc);
    touch(b);
  },

  // No file system in the browser: mirrors the desktop-only guard in `commands::workspace`.
  workspace_pick_files: (_: { bookId: string; parent: string | null }): AreaNode[] | null => {
    throw "Adicionar arquivos só funciona no app desktop";
  },
  workspace_open_file: (_: Ids): void => {
    throw "Abrir arquivos só funciona no app desktop";
  },

  workspace_to_chapter: ({ bookId, id }: Ids): ToChapterResult => {
    const b = findBook(bookId);
    const node = textNode(b.area, id);
    const doc = structuredClone(b.areaDocs[id] ?? { type: "doc", content: [] });
    b.chapters.push(newChapter(node.title, "rascunho", doc, node.notes));
    remove(b.area, id);
    delete b.areaDocs[id];
    touch(b);
    return { book: toMeta(b), items: structuredClone(b.area) };
  },
};
