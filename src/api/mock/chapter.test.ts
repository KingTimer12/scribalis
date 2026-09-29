import { describe, expect, it } from "vitest";
import { mockInvoke } from ".";
import type { AreaNode, BookMeta, BookSummary, Created, DocJSON } from "../types";
import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";

const doc = (t: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

async function newBook() {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Nova" });
  const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
  const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id });
  return { book, tree, m: tree[0].id, first: chapterOrder(tree)[0].id };
}

describe("mock chapter commands", () => {
  it("a new book opens on its only chapter, inside the Manuscrito", async () => {
    const { book, tree, first } = await newBook();
    expect(tree[0].kind).toBe("manuscript");
    expect(book.open).toBe(first);
  });

  it("split keeps before and opens after right below, in the same folder", async () => {
    const { book, m, first } = await newBook();
    const part = await mockInvoke<Created>("workspace_create", { bookId: book.id, parent: m, index: 0, kind: "folder", title: "Parte" });
    await mockInvoke("workspace_move", { bookId: book.id, id: first, parent: part.id, index: 0 });
    const out = await mockInvoke<Created>("chapter_split", { bookId: book.id, chapterId: first, before: doc("a"), after: doc("b c") });
    expect(findNode(out.items, part.id)!.children!.map((c) => c.id)).toEqual([first, out.id]);
    expect(findNode(out.items, out.id)!.words).toBe(2);
    expect(await mockInvoke<DocJSON>("chapter_load", { bookId: book.id, chapterId: first })).toEqual(doc("a"));
    expect((await mockInvoke<BookMeta>("book_open", { id: book.id })).open).toBe(out.id);
  });

  it("never deletes the last chapter nor the Manuscrito", async () => {
    const { book, m, first } = await newBook();
    await expect(mockInvoke("workspace_delete", { bookId: book.id, id: first })).rejects.toBe("A obra precisa de pelo menos um capítulo");
    await expect(mockInvoke("workspace_delete", { bookId: book.id, id: m })).rejects.toBe("O Manuscrito não pode ser excluído");
  });

  it("a text moved in becomes a chapter and back, keeping id and text", async () => {
    const { book, m } = await newBook();
    const t = await mockInvoke<Created>("workspace_create", { bookId: book.id, parent: null, index: 1, kind: "text", title: "Ana" });
    await mockInvoke("workspace_save_doc", { bookId: book.id, id: t.id, doc: doc("um dois") });
    let tree = await mockInvoke<AreaNode[]>("workspace_move", { bookId: book.id, id: t.id, parent: m, index: 1 });
    expect(findNode(tree, t.id)).toMatchObject({ kind: "chapter", status: "rascunho", words: 2 });
    expect(await mockInvoke<DocJSON>("chapter_load", { bookId: book.id, chapterId: t.id })).toEqual(doc("um dois"));
    tree = await mockInvoke<AreaNode[]>("workspace_move", { bookId: book.id, id: t.id, parent: null, index: 1 });
    expect(findNode(tree, t.id)!.kind).toBe("text");
    expect(findNode(tree, t.id)!.status).toBeUndefined();
  });

  it("neighbor follows reading order", async () => {
    const { book, m, first } = await newBook();
    const second = await mockInvoke<Created>("workspace_create", { bookId: book.id, parent: m, index: 1, kind: "chapter", title: "" });
    expect(await mockInvoke("chapter_neighbor", { bookId: book.id, chapterId: first, step: 1 })).toBe(second.id);
    expect(await mockInvoke("chapter_neighbor", { bookId: book.id, chapterId: first, step: -1 })).toBeNull();
  });
});
