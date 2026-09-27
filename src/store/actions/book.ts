import * as api from "../../api/book";
import { flushAll, scheduleBookPatch } from "../saving";
import { editBook, setState, state } from "../state";
import { flash, flashError } from "./ui";

export function setBookTitle(title: string) {
  editBook((b) => (b.title = title));
  scheduleBookPatch({ title });
}

export function setBookAuthor(author: string) {
  editBook((b) => (b.author = author));
  scheduleBookPatch({ author });
  flash(author ? "Autor: " + author : "Autor removido");
}

export async function setSeparatorText(text: string) {
  const id = state.book?.id;
  if (!id) return;
  try {
    // Pending title/author edits first, or the returned metadata would revert them.
    await flushAll();
    const meta = await api.updateBook(id, { separatorText: text || "* * *" });
    if (state.book?.id !== id) return;
    setState("book", meta);
    flash("Separador: " + (text || "* * *"));
  } catch (e) {
    flashError(e);
  }
}
