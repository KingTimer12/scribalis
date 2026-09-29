import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import { db } from "../../api/mock/db";
import type { AreaNode, BookMeta, BookSummary } from "../../api/types";
import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { setState, state } from "../state";
import { openNode } from "./open";
import { commitNodeRename, createNode, deleteNode, flushNodeNotes, moveNode, scheduleNodeNotes, setNodeNotes } from "./workspace";

/** A fresh book with its tree in the store, isolated from the samples and other tests. */
async function newBook(): Promise<BookMeta> {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
  const area = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id });
  setState({
    book, area, areaSel: null, areaOpen: null, areaExpanded: [],
    areaRenaming: null, areaRenameVal: "", areaConfirm: null, toast: "",
  });
  return book;
}

/** Everything after the Manuscrito. */
const outside = () => state.area.slice(1);
const manuscriptId = () => state.area[0].id;

describe("tree actions (mock)", () => {
  it("creates a folder, then a text node inside it, entering rename both times", async () => {
    await newBook();
    await createNode("folder");
    expect(outside()).toHaveLength(1);
    const folder = outside()[0];
    expect(folder.kind).toBe("folder");
    expect(state.areaRenaming).toBe(folder.id);
    setState("areaSel", folder.id);
    await createNode("text");
    const inFolder = findNode(state.area, folder.id)?.children ?? [];
    expect(inFolder.map((n) => [n.kind, n.title])).toEqual([["text", "Novo documento"]]);
    expect(state.areaRenaming).toBe(inFolder[0].id);
  });

  it("renames a node", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    setState("areaRenameVal", "Pesquisa");
    await commitNodeRename();
    expect(findNode(state.area, id)?.title).toBe("Pesquisa");
  });

  it("moves a node inside another folder", async () => {
    await newBook();
    await createNode("folder");
    const first = outside()[0].id;
    setState("areaSel", null);
    await createNode("folder");
    const second = outside().find((n) => n.id !== first)!.id;
    await moveNode(second, first, "inside");
    expect(outside().map((n) => n.id)).toEqual([first]);
    expect(findNode(state.area, first)?.children?.map((n) => n.id)).toEqual([second]);
  });

  it("deletes only on the second call; the open node gives way to the first chapter", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    setState("areaOpen", id);
    deleteNode(id);
    expect(state.areaConfirm).toBe(id);
    expect(outside()).toHaveLength(1);
    await deleteNode(id);
    expect(outside()).toHaveLength(0);
    expect(state.areaOpen).toBe(chapterOrder(state.area)[0].id);
  });

  it("saves node notes immediately (no debounce), skipping the call when unchanged", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    await setNodeNotes(id, "notas");
    const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: state.book!.id });
    expect(findNode(tree, id)?.notes).toBe("notas");
    await setNodeNotes(id, "notas");
    expect(findNode(state.area, id)?.notes).toBe("notas");
  });

  it("a text dropped into the Manuscrito becomes a chapter with the same id", async () => {
    await newBook();
    await createNode("text");
    const id = outside()[0].id;
    await moveNode(id, manuscriptId(), "inside");
    expect(findNode(state.area, id)?.kind).toBe("chapter");
    expect(chapterOrder(state.area).map((c) => c.id)).toContain(id);
  });

  it("an image dropped into the Manuscrito is refused with the reason", async () => {
    const book = await newBook();
    db.books.find((b) => b.id === book.id)!.area.push({ id: "img", kind: "image", title: "Mapa", notes: "", file: "arquivos/img.png" });
    setState("area", await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id }));
    await moveNode("img", manuscriptId(), "inside");
    expect(state.toast).toBe("Imagens e anexos não entram no Manuscrito");
    expect(findNode(state.area, "img")?.kind).toBe("image");
  });

  it("the last chapter cannot leave the Manuscrito", async () => {
    await newBook();
    await createNode("folder");
    const folder = outside()[0].id;
    const only = chapterOrder(state.area)[0].id;
    await moveNode(only, folder, "inside");
    expect(state.toast).toBe("A obra precisa de pelo menos um capítulo");
    expect(chapterOrder(state.area).map((c) => c.id)).toEqual([only]);
  });

  it("typed notes show at once and a flush saves them (drawer closing before `change`)", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    scheduleNodeNotes(id, "digitado");
    expect(findNode(state.area, id)?.notes).toBe("digitado");
    await flushNodeNotes();
    const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: state.book!.id });
    expect(findNode(tree, id)?.notes).toBe("digitado");
  });

  it("the open text reopens as a chapter after crossing into the Manuscrito", async () => {
    await newBook();
    await createNode("text");
    const id = outside()[0].id;
    await openNode(id, false);
    expect(state.areaOpen).toBe(id);
    await moveNode(id, manuscriptId(), "inside");
    expect(findNode(state.area, id)?.kind).toBe("chapter");
    expect(state.areaOpen).toBe(id);
    expect(state.toast).toBe("");
  });
});
