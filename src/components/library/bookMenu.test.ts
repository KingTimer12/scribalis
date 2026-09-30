import { describe, expect, it } from "vitest";
import type { BookSummary } from "../../api/types";
import { bookMenu } from "./bookMenu";

const book = (extra: Partial<BookSummary> = {}): BookSummary => ({
  id: "b1", title: "Obra", author: "", cover: null, chapters: 1, words: 0, ready: 0, updatedAt: 0, cloud: false, ...extra,
});

describe("book tile menu", () => {
  it("offers Abrir/Renomear/Trocar capa/Excluir, with hints, when there is no cover", () => {
    const items = bookMenu(book());
    expect(items.map((i) => i.label)).toEqual(["Abrir", "Renomear", "Trocar capa…", "Excluir"]);
    expect(items.map((i) => i.hint)).toEqual([undefined, "R", "C", "Del"]);
    expect(items.find((i) => i.label === "Excluir")?.danger).toBe(true);
  });

  it("adds Remover capa (Shift C) only when the book has a cover", () => {
    const items = bookMenu(book({ cover: "/tmp/cover.png" }));
    expect(items.map((i) => i.label)).toEqual(["Abrir", "Renomear", "Trocar capa…", "Remover capa", "Excluir"]);
    expect(items.find((i) => i.label === "Remover capa")?.hint).toBe("Shift C");
  });
});
