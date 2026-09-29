import { describe, expect, it } from "vitest";
import { SYNOPSIS_MAX } from "../../lib/constants";
import type { AreaNode, BookMeta, BookSummary } from "../types";
import { mockInvoke } from "./index";

describe("workspace_set_synopsis (mock)", () => {
  it("saves any node's synopsis, cut at SYNOPSIS_MAX characters like Rust", async () => {
    const created = await mockInvoke<BookSummary>("library_create", { title: "Sinopse" });
    const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
    const m = (await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id }))[0].id;
    let items = await mockInvoke<AreaNode[]>("workspace_set_synopsis", { bookId: book.id, id: m, synopsis: "Tudo" });
    expect(items[0].synopsis).toBe("Tudo");
    items = await mockInvoke<AreaNode[]>("workspace_set_synopsis", {
      bookId: book.id, id: m, synopsis: "é".repeat(SYNOPSIS_MAX + 3),
    });
    expect(Array.from(items[0].synopsis ?? "").length).toBe(SYNOPSIS_MAX);
    await expect(mockInvoke("workspace_set_synopsis", { bookId: book.id, id: "zz", synopsis: "x" })).rejects.toBe(
      "Item não encontrado",
    );
  });
});
