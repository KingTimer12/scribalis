import { describe, expect, it } from "vitest";
import type { BoardCard, BoardCreated, BookMeta, BookSummary } from "../types";
import { mockInvoke } from "./index";

async function book() {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Quadro" });
  return (await mockInvoke<BookMeta>("book_open", { id: created.id })).id;
}

describe("board (mock)", () => {
  it("behaves like the Rust board", async () => {
    const bookId = await book();
    expect(await mockInvoke<BoardCard[]>("board_list", { bookId })).toEqual([]);
    const a = await mockInvoke<BoardCreated>("board_create", { bookId, index: 0, title: "A" });
    const b = await mockInvoke<BoardCreated>("board_create", { bookId, index: 9, title: "B" });
    expect(b.cards.map((c) => c.title)).toEqual(["A", "B"]);
    await mockInvoke("board_save_text", { bookId, id: a.id, text: "texto" });
    expect(await mockInvoke("board_load_text", { bookId, id: a.id })).toBe("texto");
    const d = await mockInvoke<BoardCreated>("board_duplicate", { bookId, id: a.id });
    expect(d.cards.map((c) => c.title)).toEqual(["A", "A (cópia)", "B"]);
    expect(await mockInvoke("board_load_text", { bookId, id: d.id })).toBe("texto");
    const moved = await mockInvoke<BoardCard[]>("board_move", { bookId, id: a.id, index: 2 });
    expect(moved.map((c) => c.title)).toEqual(["A (cópia)", "B", "A"]);
    expect((await mockInvoke<BoardCard[]>("board_delete", { bookId, id: b.id })).length).toBe(2);
    await expect(mockInvoke("board_rename", { bookId, id: "zz", title: "x" })).rejects.toBe("Cartão não encontrado");
  });
});
