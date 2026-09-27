import type { BookMeta, BookPatch, ImageSlot } from "../types";
import { findBook, toMeta, touch } from "./db";

export const book = {
  book_open: ({ id }: { id: string }): BookMeta => toMeta(findBook(id)),
  book_update: ({ id, patch }: { id: string; patch: BookPatch }): BookMeta => {
    const b = findBook(id);
    if (patch.title !== undefined) b.title = patch.title;
    if (patch.author !== undefined) b.author = patch.author;
    if (patch.separatorText !== undefined) b.separator = { type: "text", text: patch.separatorText };
    if (patch.cur !== undefined) b.cur = Math.min(patch.cur, b.chapters.length - 1);
    if (patch.title !== undefined || patch.author !== undefined || patch.separatorText !== undefined) touch(b);
    return toMeta(b);
  },
  // No file system in the browser: pickers behave as if cancelled.
  book_pick_image: (_: { id: string; slot: ImageSlot }): BookMeta | null => null,
  book_insert_image: (_: { id: string }): string | null => null,
  book_clear_image: ({ id, slot }: { id: string; slot: ImageSlot }): BookMeta => {
    const b = findBook(id);
    if (slot === "header") b.header = null;
    if (slot === "footer") b.footer = null;
    if (slot === "separator") b.separator = { type: "text", text: "* * *" };
    touch(b);
    return toMeta(b);
  },
};
