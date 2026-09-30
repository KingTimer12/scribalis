import type { BookSummary } from "../../api/types";
import { clearCover, pickCover } from "../../store/actions/images";
import { openBook, requestDeleteBook, startRename } from "../../store/actions/library";
import type { MenuItem } from "../ui/ContextMenu";

/** "⋯" button or right click on a book tile. */
export function bookMenu(book: BookSummary): MenuItem[] {
  const id = book.id;
  const items: MenuItem[] = [
    { label: "Abrir", act: () => void openBook(id) },
    { label: "Renomear", hint: "R", act: () => startRename(id) },
    { label: "Trocar capa…", hint: "C", act: () => void pickCover(id) },
  ];
  if (book.cover) items.push({ label: "Remover capa", hint: "Shift C", act: () => void clearCover(id) });
  items.push({ label: "Excluir", hint: "Del", danger: true, act: () => void requestDeleteBook(id) });
  return items;
}
