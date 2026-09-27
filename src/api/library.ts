import { call } from "./invoke";
import type { BookSummary, LibraryListing } from "./types";

export const listLibrary = () => call<LibraryListing>("library_list");
export const createBook = (title: string) => call<BookSummary>("library_create", { title });
export const renameBook = (id: string, title: string) => call<BookSummary>("library_rename", { id, title });
export const deleteBook = (id: string) => call<void>("library_delete", { id });
export const restoreSamples = () => call<LibraryListing>("library_restore_samples");
