import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../../api/mock";
import { CARD_TEXT_MAX, CARD_TITLE_MAX } from "../../lib/constants";
import { createCard, loadBoard } from "../../store/actions/board";
import { setState, state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { BoardView } from "./BoardView";

async function mounted() {
  const book = await newBook();
  setState({ board: [], boardText: {}, boardSel: null });
  await loadBoard(book.id);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <BoardView />, host);
  return { host, done: () => (dispose(), host.remove()) };
}

describe("BoardView", () => {
  it("shows the empty state, then one card per board card", async () => {
    const { host, done } = await mounted();
    expect(host.textContent).toContain("Nenhum cartão ainda.");
    await createCard();
    await createCard();
    expect(host.querySelectorAll("[data-card-id]").length).toBe(2);
    done();
  });

  it("typing in a card's text updates the store", async () => {
    const { host, done } = await mounted();
    await createCard();
    const ta = host.querySelector<HTMLTextAreaElement>(".bcard-text")!;
    ta.value = "Introduz o mundo";
    ta.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(state.boardText[state.board[0].id]).toBe("Introduz o mundo");
    done();
  });

  it("keeps a card mounted when the list is replaced by a fresh copy", async () => {
    const { host, done } = await mounted();
    await createCard();
    const before = host.querySelector(".bcard-text");
    setState("board", JSON.parse(JSON.stringify(state.board)));
    expect(host.querySelector(".bcard-text")).toBe(before);
    done();
  });

  it("keeps a card's text read-only until its saved text loads", async () => {
    const book = await newBook();
    const { id } = await mockInvoke<{ id: string }>("board_create", { bookId: book.id, index: 0, title: "" });
    await mockInvoke("board_save_text", { bookId: book.id, id, text: "Do disco" });
    setState({ board: [], boardText: {}, boardSel: null });
    await loadBoard(book.id);
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => <BoardView />, host);
    const ta = host.querySelector<HTMLTextAreaElement>(".bcard-text")!;
    expect(ta.readOnly).toBe(true);
    await vi.waitFor(() => expect(ta.value).toBe("Do disco"));
    expect(ta.readOnly).toBe(false);
    // Fields stop at the length the save keeps.
    expect(ta.maxLength).toBe(CARD_TEXT_MAX);
    expect(host.querySelector<HTMLInputElement>(".bcard-title")!.maxLength).toBe(CARD_TITLE_MAX);
    dispose();
    host.remove();
  });
});
