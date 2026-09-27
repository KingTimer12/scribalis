import * as api from "../../api/book";
import type { ImageSlot } from "../../api/types";
import { insertImage } from "../../editor/bridge";
import { flushAll } from "../saving";
import { refreshLibrary } from "./library";
import { setState, state } from "../state";
import { flash, flashError } from "./ui";

const LABEL: Record<ImageSlot, string> = { cover: "Capa", header: "Cabeçalho", footer: "Rodapé", separator: "Separador" };

/** Library: pick a cover for any book (Rust opens the dialog and crops). */
export async function pickCover(id: string) {
  try {
    if (await api.pickBookImage(id, "cover")) {
      await refreshLibrary();
      flash("Capa atualizada");
    }
  } catch (e) {
    flashError(e);
  }
}

export async function clearCover(id: string) {
  try {
    await api.clearBookImage(id, "cover");
    await refreshLibrary();
    flash("Capa removida — volta a letra");
  } catch (e) {
    flashError(e);
  }
}

/** Editor: image settings of the open book. */
export async function pickBookImage(slot: ImageSlot) {
  const id = state.book?.id;
  if (!id) return;
  try {
    // Pending title/author edits first, or the returned metadata would revert them.
    await flushAll();
    const meta = await api.pickBookImage(id, slot);
    if (meta && state.book?.id === id) {
      setState("book", meta);
      flash(LABEL[slot] + " atualizado");
    }
  } catch (e) {
    flashError(e);
  }
}

export async function clearBookImage(slot: ImageSlot) {
  const id = state.book?.id;
  if (!id) return;
  try {
    await flushAll();
    const meta = await api.clearBookImage(id, slot);
    if (state.book?.id !== id) return;
    setState("book", meta);
    flash(LABEL[slot] + " removido");
  } catch (e) {
    flashError(e);
  }
}

export async function insertChapterImage() {
  const id = state.book?.id;
  if (!id) return;
  try {
    const src = await api.insertChapterImage(id);
    // The image was copied into book `id`: only insert it if that book is still open.
    if (src && state.book?.id === id) insertImage(src);
  } catch (e) {
    flashError(e);
  }
}
