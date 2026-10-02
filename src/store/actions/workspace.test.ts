import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../../api/mock";
import * as workspaceApi from "../../api/workspace";
import { db } from "../../api/mock/db";
import type { AreaNode, BookMeta, BookSummary, DocJSON } from "../../api/types";
import { setEditor } from "../../editor/bridge";
import { flushAll, scheduleDocSave, settleDocSave } from "../saving";
import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { answerConfirm, pendingConfirm } from "../confirm";
import { setState, state } from "../state";
import { openNode } from "./open";
import {
  commitNodeRename, createNode, deleteNode, flushNodeNotes, moveIntoManuscript, moveNode, moveOutOfManuscript, moveTo,
  requestDelete, scheduleNodeNotes, setNodeNotes, startNodeRename,
} from "./workspace";

// Lets a test type into the editor in the middle of the move IPC.
let duringMove: (() => void) | null = null;
vi.mock("../../api/workspace", async (orig) => {
  const real = await orig<typeof import("../../api/workspace")>();
  return {
    ...real,
    areaMove: (...args: Parameters<typeof real.areaMove>) => {
      duringMove?.();
      return real.areaMove(...args);
    },
  };
});

/** Just enough of an Editor for the bridge; `type` simulates the user editing. */
function fakeEditor() {
  let content: DocJSON = { type: "doc", content: [] };
  const chain = { setMeta: () => chain, setContent: (d: DocJSON) => ((content = d), chain), run: () => true };
  return { editor: { chain: () => chain, getJSON: () => content } as unknown as Editor, type: (d: DocJSON) => (content = d) };
}
const para = (t: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

afterEach(() => {
  duringMove = null;
  setEditor(null);
});

/** A fresh book with its tree in the store, isolated from the samples and other tests. */
async function newBook(): Promise<BookMeta> {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
  const area = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id });
  setState({
    book, area, areaSel: null, areaOpen: null, areaExpanded: [],
    areaRenaming: null, areaRenameVal: "", toast: "",
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

  it("deletes the node; the open node gives way to the first chapter", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    setState("areaOpen", id);
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

  it("flushAll saves pending notes to the book they were typed in, even after a book switch", async () => {
    const first = await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    scheduleNodeNotes(id, "nao perder");
    await newBook();
    expect(state.book!.id).not.toBe(first.id);
    await flushAll();
    const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: first.id });
    expect(findNode(tree, id)?.notes).toBe("nao perder");
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

  it("text typed during a converting move is saved under the new kind", async () => {
    const book = await newBook();
    await createNode("text");
    const id = outside()[0].id;
    const ed = fakeEditor();
    setEditor(ed.editor);
    await openNode(id, false);
    duringMove = () => {
      ed.type(para("digitado no meio"));
      scheduleDocSave();
    };
    await moveNode(id, manuscriptId(), "inside");
    expect(findNode(state.area, id)?.kind).toBe("chapter");
    expect(await mockInvoke("chapter_load", { bookId: book.id, chapterId: id })).toEqual(para("digitado no meio"));
  });

  it("text typed during a refused move is saved under the unchanged kind", async () => {
    const book = await newBook();
    await createNode("text");
    const id = outside()[0].id;
    const ed = fakeEditor();
    setEditor(ed.editor);
    await openNode(id, false);
    duringMove = () => {
      ed.type(para("digitado e recusado"));
      scheduleDocSave();
    };
    // A node cannot go inside itself: Rust's rule refuses this.
    await moveTo(id, id, 0);
    await settleDocSave();
    expect(state.toast).toBe("Não dá para mover uma pasta para dentro dela mesma");
    expect(findNode(state.area, id)?.kind).toBe("text");
    expect(await mockInvoke("workspace_load_doc", { bookId: book.id, id })).toEqual(para("digitado e recusado"));
  });

  it("Mover para o Manuscrito / para fora convert the node and say so", async () => {
    await newBook();
    await createNode("text");
    const t = outside()[0].id;
    await moveIntoManuscript(t);
    expect(findNode(state.area, t)?.kind).toBe("chapter");
    const order = chapterOrder(state.area);
    expect(order[order.length - 1].id).toBe(t);
    expect(state.toast).toBe("Agora é o capítulo 02");
    await moveOutOfManuscript(t);
    expect(findNode(state.area, t)?.kind).toBe("text");
    expect(state.area[state.area.length - 1].id).toBe(t);
    expect(state.toast).toBe("«Novo documento» saiu do Manuscrito");
  });

  it("requestDelete asks first and deletes only after the user confirms", async () => {
    await newBook();
    setState("areaSel", manuscriptId());
    await createNode("folder");
    const part = state.areaSel!;
    await createNode("chapter");
    await createNode("chapter");
    const done = requestDelete(part);
    expect(pendingConfirm()?.title).toBe("Excluir “Nova pasta”?");
    expect(pendingConfirm()?.message).toBe("A pasta e os 2 itens dentro dela serão excluídos.");
    expect(findNode(state.area, part)).not.toBeNull();
    answerConfirm(true);
    await done;
    expect(findNode(state.area, part)).toBeNull();
  });

  it("requestDelete keeps the node when the user cancels", async () => {
    await newBook();
    await createNode("folder");
    const id = outside()[0].id;
    const spy = vi.spyOn(workspaceApi, "areaDelete");
    const done = requestDelete(id);
    expect(pendingConfirm()).not.toBeNull();
    answerConfirm(false);
    await done;
    expect(spy).not.toHaveBeenCalled();
    expect(findNode(state.area, id)).not.toBeNull();
    spy.mockRestore();
  });

  it("the Manuscrito shows a message and no dialog", async () => {
    await newBook();
    await requestDelete(manuscriptId());
    expect(pendingConfirm()).toBeNull();
    expect(state.toast).toBe("O Manuscrito não pode ser excluído.");
  });

  it("renames the Manuscrito and moves it into a folder, chapters and all", async () => {
    await newBook();
    const m = manuscriptId();
    startNodeRename(m);
    setState("areaRenameVal", "Livro Um");
    await commitNodeRename();
    expect(findNode(state.area, m)?.title).toBe("Livro Um");
    await createNode("folder");
    const folder = outside()[0].id;
    await moveTo(m, folder, 0);
    expect(state.area[0].id).toBe(folder);
    expect(state.area[0].children?.[0].id).toBe(m);
    expect(chapterOrder(state.area)).toHaveLength(1);
    // The folder now guards the Manuscrito: it cannot be deleted.
    await requestDelete(folder);
    expect(pendingConfirm()).toBeNull();
    expect(state.toast).toBe("A pasta guarda o Manuscrito, que não pode ser excluído.");
  });
});
