// Mock copy of the Rust Manuscrito rules (`src-tauri/src/model/manuscript.rs`) and of the
// chapter ⇄ text conversion (`src-tauri/src/ops/manuscript.rs`): same messages, so the
// browser build and the tests refuse exactly what the desktop app refuses.
import type { AreaNode, NodeKind } from "../types";
import { docWords } from "../../lib/doc";
import { chapterCount, chapterOrder, inManuscript, manuscriptOf } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { EMPTY, type MockBook } from "./db";

export const LAST_CHAPTER = "A obra precisa de pelo menos um capítulo";
export const NO_MEDIA = "Imagens e anexos não entram no Manuscrito";

const hasMedia = (n: AreaNode): boolean => n.kind === "image" || n.kind === "file" || (n.children ?? []).some(hasMedia);
const landsInside = (items: AreaNode[], parent: string | null) => !!parent && inManuscript(items, parent);
function takesEveryChapter(items: AreaNode[], node: AreaNode) {
  const n = chapterCount(node);
  return n > 0 && n === chapterOrder(items).length;
}

export function checkDelete(items: AreaNode[], id: string) {
  const node = findNode(items, id);
  if (!node) return;
  if (node.kind === "manuscript") throw "O Manuscrito não pode ser excluído";
  if (manuscriptOf(node.children ?? [])) throw "A pasta guarda o Manuscrito, que não pode ser excluído";
  if (takesEveryChapter(items, node)) throw LAST_CHAPTER;
}

export function checkCreate(items: AreaNode[], kind: NodeKind, parent: string | null) {
  const inside = landsInside(items, parent);
  if (kind === "manuscript") throw "Item inválido";
  if (kind === "chapter" && !inside) throw "Capítulos ficam dentro do Manuscrito";
  if (kind === "text" && inside) throw "Textos livres ficam fora do Manuscrito";
  if ((kind === "image" || kind === "file") && inside) throw NO_MEDIA;
}

export function checkMove(items: AreaNode[], id: string, parent: string | null) {
  const node = findNode(items, id);
  if (!node) return;
  if (node.kind === "manuscript") {
    if (parent && findNode(items, parent)?.kind !== "folder") throw "O Manuscrito só fica na raiz ou dentro de pastas";
    return;
  }
  const inside = landsInside(items, parent);
  if (inside && hasMedia(node)) throw NO_MEDIA;
  if (!inside && inManuscript(items, id) && takesEveryChapter(items, node)) throw LAST_CHAPTER;
}

/** Texts of the subtree become chapters (`into`) or chapters become texts; ids and documents stay. */
export function convert(book: MockBook, node: AreaNode, into: boolean) {
  if (node.kind === (into ? "text" : "chapter")) {
    if (into) {
      Object.assign(node, { kind: "chapter", file: "capitulos/" + node.id + ".md", status: "rascunho", words: docWords(book.docs[node.id] ?? EMPTY) });
    } else {
      node.kind = "text";
      node.file = "arquivos/" + node.id + ".md";
      delete node.status;
      delete node.words;
    }
  }
  for (const c of node.children ?? []) convert(book, c, into);
}
