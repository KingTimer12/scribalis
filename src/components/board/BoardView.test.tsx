import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { AreaNode, DocJSON } from "../../api/types";
import { findNode } from "../../lib/tree";
import { createCard } from "../../store/actions/board";
import { loadArea } from "../../store/actions/workspace";
import { state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { BoardView } from "./BoardView";

// jsdom has no layout: selecting a card scrolls it into view.
Element.prototype.scrollIntoView = vi.fn();

const para = (text: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

/** A fresh book with a folder outside the Manuscrito, its board mounted. */
async function mounted() {
  const book = await newBook();
  const { id } = await mockInvoke<{ id: string }>("workspace_create", { bookId: book.id, parent: null, index: 9, kind: "folder", title: "Pesquisa" });
  await loadArea();
  const folder = () => findNode(state.area, id) as AreaNode;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <BoardView parent={folder()} />, host);
  return { book, id, host, done: () => (dispose(), host.remove()) };
}

describe("BoardView", () => {
  it("shows the empty state, then one card per child of the folder", async () => {
    const { id, host, done } = await mounted();
    expect(host.textContent).toContain("Nada aqui ainda.");
    await createCard(id);
    await createCard(id);
    expect(host.querySelectorAll("[data-card-id]").length).toBe(2);
    expect(findNode(state.area, id)!.children!.map((c) => c.kind)).toEqual(["text", "text"]);
    done();
  });

  it("the card's text is the document's synopsis", async () => {
    const { id, host, done } = await mounted();
    const card = (await createCard(id))!;
    const ta = host.querySelector<HTMLTextAreaElement>(".bcard-text")!;
    ta.value = "Introduz o mundo";
    ta.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(findNode(state.area, card)!.synopsis).toBe("Introduz o mundo");
    done();
  });

  it("without a synopsis, the document's opening text is the placeholder", async () => {
    const { book, id, host, done } = await mounted();
    const card = (await createCard(id))!;
    await mockInvoke("workspace_save_doc", { bookId: book.id, id: card, doc: para("Era uma   vez um reino.") });
    // Placeholders reload when the cards change.
    await createCard(id);
    const ta = () => host.querySelector<HTMLTextAreaElement>(`[data-card-id="${card}"] .bcard-text`)!;
    await vi.waitFor(() => expect(ta().placeholder).toBe("Era uma vez um reino."));
    expect(ta().value).toBe("");
    done();
  });

  it("keeps a card mounted when the tree is replaced by a fresh copy", async () => {
    const { id, host, done } = await mounted();
    await createCard(id);
    const before = host.querySelector(".bcard-text");
    await loadArea();
    expect(host.querySelector(".bcard-text")).toBe(before);
    done();
  });
});
