import type { BookSummary, LibraryListing } from "../types";
import { chapter, db, findBook, mockBook, resetSamples, toSummary, touch } from "./db";

export const library = {
  library_list: (): LibraryListing => ({ books: db.books.map(toSummary), warnings: [] }),
  library_create: ({ title }: { title: string }): BookSummary => {
    const b = mockBook(title, [chapter("", "rascunho", { type: "doc", content: [] })]);
    db.books.unshift(b);
    return toSummary(b);
  },
  library_rename: ({ id, title }: { id: string; title: string }): BookSummary => {
    const b = findBook(id);
    b.title = title;
    touch(b);
    return toSummary(b);
  },
  library_delete: ({ id }: { id: string }) => {
    db.books = db.books.filter((b) => b.id !== id);
  },
  library_restore_samples: (): LibraryListing => {
    resetSamples();
    return library.library_list();
  },
};
