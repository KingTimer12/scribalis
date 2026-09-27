import { batch } from "solid-js";
import { emptyChap, sampleBooks } from "../data/samples";
import { COLS } from "../lib/constants";
import { shrinkImage } from "../lib/cover";
import { allWords, uid } from "../lib/format";
import type { Book } from "../lib/types";
import { focusTarget } from "./focus";
import { libList, libSelIndex, session, setState, sortedBooks, state } from "./state";
import { flash } from "./ui";

/* ---------- abrir / voltar ---------- */

export function openBook(id: string, target: "title" | "body" = "body") {
  const i = state.books.findIndex((b) => b.id === id);
  if (i < 0) return;
  const b = state.books[i];
  session.enterStreak = 0;
  batch(() => {
    if (!b.chapters.length) setState("books", i, "chapters", [emptyChap()]);
    const n = state.books[i].chapters.length;
    setState("books", i, "cur", Math.max(0, Math.min(b.cur || 0, n - 1)));
    setState({
      curId: id,
      view: "editor",
      panel: null,
      q: "",
      tripleHint: false,
      focus: false,
      libConfirm: null,
      renaming: null,
    });
  });
  if (target === "title") focusTarget("title", 0);
  else focusTarget("body", "end");
}

export function goLibrary() {
  const idx = Math.max(0, sortedBooks().findIndex((b) => b.id === state.curId));
  focusTarget("lib");
  setState({
    view: "library",
    panel: null,
    focus: false,
    libSel: idx,
    libQ: "",
    libConfirm: null,
    renaming: null,
    tripleHint: false,
  });
}

/* ---------- criar / renomear / excluir ---------- */

export function startNew() {
  session.newId = uid();
  focusTarget("rename", 0);
  setState({ view: "library", panel: null, renaming: "new", renameVal: "", libConfirm: null });
}

export function startRename(id: string) {
  const b = state.books.find((x) => x.id === id);
  if (!b) return;
  focusTarget("rename", "end");
  setState({ renaming: id, renameVal: b.title, libConfirm: null });
}

export function cancelRename() {
  focusTarget("lib");
  setState({ renaming: null, renameVal: "" });
}

export function commitRename() {
  const val = state.renameVal.trim();
  if (state.renaming === "new") {
    const book: Book = {
      id: session.newId || uid(),
      title: val || "Obra sem título",
      cover: null,
      cur: 0,
      updatedAt: Date.now(),
      chapters: [emptyChap()],
    };
    setState({ books: [book, ...state.books], renaming: null, renameVal: "" });
    openBook(book.id, "title");
    flash("Obra criada — escreva o título do capítulo 01");
    return;
  }
  const id = state.renaming;
  setState(
    "books",
    (b) => b.id === id,
    (b) => ({ title: val || b.title, updatedAt: Date.now() }),
  );
  focusTarget("lib");
  setState({ renaming: null, renameVal: "", libSel: 0 });
  flash("Obra renomeada");
}

export function deleteBook(id: string) {
  const gone = state.books.find((b) => b.id === id);
  const books = state.books.filter((b) => b.id !== id);
  focusTarget("lib");
  setState({
    books,
    curId: state.curId === id ? null : state.curId,
    libConfirm: null,
    libSel: Math.max(0, Math.min(state.libSel, books.length - 1)),
  });
  flash('"' + (gone ? gone.title : "Obra") + '" excluída');
}

export function restoreSamples() {
  const books = sampleBooks();
  session.baseWords = allWords(books);
  focusTarget("lib");
  setState({ books, curId: null, libSel: 0 });
  flash("Exemplos restaurados");
}

/* ---------- capa ---------- */

let fileInput: HTMLInputElement | undefined;
let coverTarget: string | null = null;

export const registerCoverInput = (el: HTMLInputElement) => {
  fileInput = el;
};

export function setCover(id: string, url: string | null) {
  setState("books", (b) => b.id === id, "cover", url);
}

export function pickCover(id: string | null) {
  if (!id || !fileInput) return;
  coverTarget = id;
  try {
    fileInput.click();
  } catch {
    flash("Não foi possível abrir o seletor de arquivos aqui");
  }
}

export async function onCoverFile(file: File | undefined) {
  const id = coverTarget;
  if (!file || !id) return;
  if (!/^image\//.test(file.type)) return flash("Escolha um arquivo de imagem");
  const url = await shrinkImage(file);
  if (!url) return flash("Não foi possível ler a imagem");
  setCover(id, url);
  flash("Capa atualizada");
}

/* ---------- teclado ---------- */

const is = (e: KeyboardEvent, letter: string) =>
  e.code === "Key" + letter.toUpperCase() || e.key.toLowerCase() === letter;

/** Teclas da grade de obras (só quando a própria grade tem o foco). */
export function libKey(e: KeyboardEvent, gridEl: HTMLElement) {
  if (e.target !== gridEl) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const list = libList();
  const n = list.length;
  const sel = libSelIndex(list);
  const cur = list[sel];
  const k = e.key;
  const isDel = k === "Delete" || k === "Backspace";
  if (!isDel && state.libConfirm && k !== "Shift") setState("libConfirm", null);

  const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS } as Record<string, number>)[k];
  if (step) {
    e.preventDefault();
    if (!n) return;
    const next = sel + step;
    if (next >= 0 && next < n) setState("libSel", next);
    else if (step === COLS && Math.floor(sel / COLS) < Math.floor((n - 1) / COLS)) setState("libSel", n - 1);
  } else if (is(e, "c") && cur) {
    e.preventDefault();
    if (!e.shiftKey) pickCover(cur.id);
    else if (cur.cover) {
      setCover(cur.id, null);
      flash("Capa removida — volta a letra");
    }
  } else if (k === "Enter") {
    e.preventDefault();
    if (cur) openBook(cur.id);
  } else if (is(e, "n")) {
    e.preventDefault();
    startNew();
  } else if (is(e, "r") && cur) {
    e.preventDefault();
    startRename(cur.id);
  } else if (isDel && cur) {
    e.preventDefault();
    if (state.libConfirm === cur.id) deleteBook(cur.id);
    else setState("libConfirm", cur.id);
  } else if (k === "/") {
    e.preventDefault();
    focusTarget("libq", "end");
  } else if (k === "Escape" && (state.libConfirm || state.libQ)) {
    e.preventDefault();
    e.stopPropagation();
    setState({ libConfirm: null, libQ: "" });
  }
}

export function libQKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusTarget("lib");
  } else if (e.key === "Enter") {
    e.preventDefault();
    const list = libList();
    const b = list[libSelIndex(list)];
    if (b) openBook(b.id);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    focusTarget("lib");
    setState({ libQ: "", libSel: 0 });
  }
}

export function renameKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    commitRename();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cancelRename();
  }
}
