import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { BoardCard } from "../../api/types";
import { newBook } from "../../test/newBook";
import { answerConfirm } from "../confirm";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { createCard, deleteCard, duplicateCard, loadBoard, loadCardText, moveCard, requestCardDelete } from "./board";
import { flushCard, scheduleCardText, scheduleCardTitle } from "./boardText";
import { openNode } from "./open";
import { mainTab, setMainTab } from "./tabs";
import { toggleFocusMode } from "./ui";

const saved = (bookId: string, id: string) => mockInvoke<string>("board_load_text", { bookId, id });
const titles = () => state.board.map((c) => c.title);

async function bookWithBoard() {
  const book = await newBook();
  setState({ board: [], boardText: {}, boardSel: null });
  await loadBoard(book.id);
  return book;
}

describe("board store", () => {
  it("creates, moves, duplicates and deletes cards", async () => {
    await bookWithBoard();
    await createCard();
    const a = state.boardSel!;
    await createCard();
    expect(state.board.length).toBe(2);
    expect(state.boardText[a]).toBe("");
    await moveCard(a, 1);
    expect(state.board[1].id).toBe(a);
    await duplicateCard(a);
    expect(state.board.length).toBe(3);
    await deleteCard(a);
    expect(state.board.some((c) => c.id === a)).toBe(false);
  });

  it("asks before deleting", async () => {
    await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    const asked = requestCardDelete(id);
    answerConfirm(false);
    await asked;
    expect(state.board.length).toBe(1);
  });

  it("title and text show at once and save on flush", async () => {
    const book = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    scheduleCardTitle(id, "Capítulo 1");
    scheduleCardText(id, "O capítulo introduz o mundo venante");
    expect(titles()).toEqual(["Capítulo 1"]);
    await flushCard();
    expect(await saved(book.id, id)).toBe("O capítulo introduz o mundo venante");
    const list = await mockInvoke<BoardCard[]>("board_list", { bookId: book.id });
    expect(list[0].title).toBe("Capítulo 1");
  });

  it("flushAll lands a pending card edit in its own book", async () => {
    const first = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    scheduleCardText(id, "nao perder");
    await bookWithBoard();
    await flushAll();
    expect(await saved(first.id, id)).toBe("nao perder");
  });

  it("deleting a card drops its pending edit", async () => {
    const book = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    scheduleCardText(id, "vai sumir");
    await deleteCard(id);
    await flushAll();
    await expect(saved(book.id, id)).rejects.toBe("Cartão não encontrado");
  });

  it("loads a card's text once", async () => {
    const book = await bookWithBoard();
    await createCard();
    const id = state.boardSel!;
    await mockInvoke("board_save_text", { bookId: book.id, id, text: "do disco" });
    // A store's shallow merge would keep the old key here: replace the whole record instead.
    setState({ boardText: {} });
    await loadCardText(id);
    expect(state.boardText[id]).toBe("do disco");
  });
});

describe("main tab", () => {
  it("is remembered per book and opening a text goes back to the Editor", async () => {
    await bookWithBoard();
    expect(mainTab()).toBe("editor");
    setMainTab("board");
    expect(mainTab()).toBe("board");
    expect(state.prefs.boardTab).toContain(state.book!.id);
    const chapter = state.area[0].children![0].id;
    await openNode(chapter, false);
    expect(mainTab()).toBe("editor");
  });

  it("focus mode does not turn on over the board", async () => {
    await bookWithBoard();
    setMainTab("board");
    toggleFocusMode();
    expect(state.focus).toBe(false);
    setMainTab("editor");
  });
});
