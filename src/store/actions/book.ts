import * as api from "../../api/book";
import { scheduleBookPatch } from "../saving";
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
    setState("book", await api.updateBook(id, { separatorText: text || "* * *" }));
    flash("Separador: " + (text || "* * *"));
  } catch (e) {
    flashError(e);
  }
}
