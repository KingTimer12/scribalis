import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { AreaNode, BookSummary, DocJSON } from "../../api/types";
import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { state } from "../state";
import { newChapterAfterCurrent, setStatus, splitCurrent } from "./chapters";
import { openBook } from "./library";
import { goChapterStep } from "./open";

const doc = (t: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

/** Opens a fresh book (one chapter), isolated from the samples and the other tests. */
async function openNew() {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  await openBook(created.id);
}

describe("chapters in the tree", () => {
  it("a book opens on its chapter, with the Manuscrito expanded", async () => {
    await openNew();
    expect(state.view).toBe("book");
    expect(state.areaOpen).toBe(chapterOrder(state.area)[0].id);
    expect(state.areaExpanded).toContain(state.area[0].id);
  });

  it("Enter ×3 opens the new chapter right after the current one", async () => {
    await openNew();
    const first = state.areaOpen!;
    await splitCurrent(doc("antes"), doc("depois"));
    const order = chapterOrder(state.area).map((c) => c.id);
    expect(order).toHaveLength(2);
    expect(order[0]).toBe(first);
    expect(state.areaOpen).toBe(order[1]);
    expect(state.book!.open).toBe(order[1]);
  });

  it("a new chapter after the current one opens right below", async () => {
    await openNew();
    await newChapterAfterCurrent();
    expect(chapterOrder(state.area)).toHaveLength(2);
    expect(state.areaOpen).toBe(chapterOrder(state.area)[1].id);
  });

  it("Alt ↑ walks the reading order and says when it ends", async () => {
    await openNew();
    const first = state.areaOpen!;
    await newChapterAfterCurrent();
    await goChapterStep(-1);
    expect(state.areaOpen).toBe(first);
    await goChapterStep(-1);
    expect(state.toast).toBe("Este é o primeiro capítulo");
    expect(state.areaOpen).toBe(first);
  });

  it("status changes in the tree and in the backend", async () => {
    await openNew();
    const id = state.areaOpen!;
    setStatus(id, "pronto");
    expect(findNode(state.area, id)!.status).toBe("pronto");
    const tree = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: state.book!.id });
    expect(findNode(tree, id)!.status).toBe("pronto");
  });
});
