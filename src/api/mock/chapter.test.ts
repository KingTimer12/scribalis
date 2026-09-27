import { describe, expect, it } from "vitest";
import { mockInvoke } from ".";
import type { BookMeta, DocJSON, LibraryListing } from "../types";

const doc = (t: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

describe("mock chapter commands", () => {
  it("split keeps before, opens after as the next current chapter", async () => {
    const { books } = await mockInvoke<LibraryListing>("library_list", {});
    const b = await mockInvoke<BookMeta>("book_open", { id: books[0].id });
    const first = b.chapters[0].id;
    const after = await mockInvoke<BookMeta>("chapter_split", { bookId: b.id, chapterId: first, before: doc("a"), after: doc("b c") });
    expect(after.cur).toBe(1);
    expect(after.chapters[1].words).toBe(2);
    expect(await mockInvoke<DocJSON>("chapter_load", { bookId: b.id, chapterId: first })).toEqual(doc("a"));
  });

  it("refuses to delete the only chapter", async () => {
    const created = await mockInvoke<{ id: string }>("library_create", { title: "Nova" });
    const b = await mockInvoke<BookMeta>("book_open", { id: created.id });
    await expect(mockInvoke("chapter_delete", { bookId: b.id, chapterId: b.chapters[0].id })).rejects.toBe(
      "A obra precisa de pelo menos um capítulo",
    );
  });

  it("rejects move with out-of-range from and leaves chapter count unchanged", async () => {
    const { books } = await mockInvoke<LibraryListing>("library_list", {});
    const b = await mockInvoke<BookMeta>("book_open", { id: books[0].id });
    const initialCount = b.chapters.length;
    await expect(mockInvoke("chapter_move", { bookId: b.id, from: 999, to: 0 })).rejects.toBe("Posição inválida");
    const after = await mockInvoke<BookMeta>("book_open", { id: b.id });
    expect(after.chapters.length).toBe(initialCount);
  });
});
