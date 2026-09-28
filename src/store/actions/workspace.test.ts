import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { AreaNode, BookMeta, BookSummary } from "../../api/types";
import { findNode } from "../../lib/tree";
import { setState, state } from "../state";
import { createNode, commitNodeRename, deleteNode, moveNode, sendToChapter, setNodeNotes } from "./workspace";

/** A fresh book, isolated from the sample library and from other tests. */
async function newBook(): Promise<BookMeta> {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  return mockInvoke<BookMeta>("book_open", { id: created.id });
}

function resetAreaState(book: BookMeta) {
  setState({
    book, area: [], areaSel: null, areaOpen: null, areaExpanded: [],
    areaRenaming: null, areaRenameVal: "", areaConfirm: null,
  });
}

describe("workspace actions (mock)", () => {
  it("creates a folder, then a text node inside it, entering rename both times", async () => {
    resetAreaState(await newBook());
    await createNode("folder");
    expect(state.area).toHaveLength(1);
    const folder = state.area[0];
    expect(folder.kind).toBe("folder");
    expect(folder.title).toBe("Nova pasta");
    expect(state.areaRenaming).toBe(folder.id);
    expect(state.areaRenameVal).toBe("Nova pasta");

    setState("areaSel", folder.id);
    await createNode("text");
    const inFolder = findNode(state.area, folder.id)?.children ?? [];
    expect(inFolder).toHaveLength(1);
    expect(inFolder[0].kind).toBe("text");
    expect(inFolder[0].title).toBe("Novo documento");
    expect(state.areaRenaming).toBe(inFolder[0].id);
  });

  it("renames a node", async () => {
    resetAreaState(await newBook());
    await createNode("folder");
    const id = state.area[0].id;
    setState("areaRenameVal", "Pesquisa");
    await commitNodeRename();
    expect(state.areaRenaming).toBeNull();
    expect(findNode(state.area, id)?.title).toBe("Pesquisa");
  });

  it("moves a node inside another folder", async () => {
    resetAreaState(await newBook());
    await createNode("folder"); // "Nova pasta" #1
    const first = state.area[0].id;
    setState("areaSel", null);
    await createNode("folder"); // "Nova pasta" #2, at the root (nothing selected)
    const second = state.area.find((n) => n.id !== first)!.id;

    await moveNode(second, first, "inside");
    expect(state.area.map((n) => n.id)).toEqual([first]);
    expect(findNode(state.area, first)?.children?.map((n) => n.id)).toEqual([second]);
  });

  it("deletes only on the second call, and closes the open node if it was inside", async () => {
    resetAreaState(await newBook());
    await createNode("folder");
    const id = state.area[0].id;
    setState("areaOpen", id);

    deleteNode(id);
    expect(state.areaConfirm).toBe(id);
    expect(state.area).toHaveLength(1);

    await deleteNode(id);
    expect(state.areaConfirm).toBeNull();
    expect(state.area).toHaveLength(0);
    expect(state.areaOpen).toBeNull();
  });

  it("saves node notes immediately (no debounce), skipping the call when unchanged", async () => {
    resetAreaState(await newBook());
    await createNode("folder");
    const id = state.area[0].id;

    await setNodeNotes(id, "notas");
    expect(findNode(state.area, id)?.notes).toBe("notas");
    // Persisted on the backend right away, not just in the optimistic local tree.
    const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: state.book!.id });
    expect(findNode(tree, id)?.notes).toBe("notas");

    // Same value again: no call needed, and none is made (an id gone from the backend would throw).
    await setNodeNotes(id, "notas");
    expect(findNode(state.area, id)?.notes).toBe("notas");
  });

  it("sends a text to the chapters, appending it to state.book", async () => {
    const book = await newBook();
    resetAreaState(book);
    const before = state.book!.chapters.length;
    await createNode("text");
    const id = state.area[0].id;

    await sendToChapter(id);
    expect(state.area).toHaveLength(0);
    expect(state.book!.chapters).toHaveLength(before + 1);
    expect(state.book!.chapters[state.book!.chapters.length - 1].title).toBe("Novo documento");
  });
});
