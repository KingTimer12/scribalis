import { call } from "./invoke";
import type { BookMeta, BookPatch, ImageSlot } from "./types";

export const openBook = (id: string) => call<BookMeta>("book_open", { id });
export const updateBook = (id: string, patch: BookPatch) => call<BookMeta>("book_update", { id, patch });
export const pickBookImage = (id: string, slot: ImageSlot) => call<BookMeta | null>("book_pick_image", { id, slot });
export const clearBookImage = (id: string, slot: ImageSlot) => call<BookMeta>("book_clear_image", { id, slot });
export const insertChapterImage = (id: string) => call<string | null>("book_insert_image", { id });
