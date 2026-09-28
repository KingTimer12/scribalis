import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { BookMeta, BookSummary } from "../../api/types";
import { setState, state } from "../state";
import { deleteChapter, requestChapterDelete } from "./chapters";

/** A fresh book with three chapters, the last one open. */
async function bookWithThree(): Promise<BookMeta> {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  await mockInvoke<BookMeta>("chapter_insert", { bookId: created.id, at: 1 });
  const meta = await mockInvoke<BookMeta>("chapter_insert", { bookId: created.id, at: 2 });
  setState({ book: meta, view: "editor", panel: "index", indexSel: 0, indexConfirm: null });
  return meta;
}

describe("chapter deletion", () => {
  it("deleting a chapter before the open one keeps that chapter open", async () => {
    const meta = await bookWithThree();
    const open = meta.chapters[2].id;
    expect(meta.cur).toBe(2);
    await deleteChapter(meta.chapters[0].id);
    expect(state.book!.chapters).toHaveLength(2);
    expect(state.book!.chapters[state.book!.cur].id).toBe(open);
  });

  it("the index asks twice before deleting", async () => {
    const meta = await bookWithThree();
    await requestChapterDelete(1);
    expect(state.indexConfirm).toBe(meta.chapters[1].id);
    expect(state.book!.chapters).toHaveLength(3);
    await requestChapterDelete(1);
    expect(state.indexConfirm).toBeNull();
    expect(state.book!.chapters.map((c) => c.id)).toEqual([meta.chapters[0].id, meta.chapters[2].id]);
  });

  it("never deletes the last chapter", async () => {
    const created = await mockInvoke<BookSummary>("library_create", { title: "Só um" });
    const meta = await mockInvoke<BookMeta>("book_open", { id: created.id });
    setState({ book: meta });
    await deleteChapter(meta.chapters[0].id);
    expect(state.book!.chapters).toHaveLength(1);
    expect(state.toast).toBe("A obra precisa de pelo menos um capítulo");
  });
});
