import * as api from "../../api/board";
import { askConfirm } from "../confirm";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { dropCardEdit } from "./boardText";
import { run as runAction } from "./run";

/** Runs a board action; a stale card id reloads the board instead of showing an error. */
const run = (fn: () => Promise<void>) =>
  runAction(fn, async (e) => {
    if (e !== "Cartão não encontrado" || !state.book) return false;
    await loadBoard(state.book.id);
    return true;
  });

export function selectCard(id: string | null) {
  setState("boardSel", id);
}

/** The board of `bookId` (cards only; texts load as cards show). */
export async function loadBoard(bookId: string) {
  await run(async () => {
    const cards = await api.boardList(bookId);
    if (state.book?.id === bookId) setState({ board: cards });
  });
}

/** Loads a card's text once; later calls keep what is in memory (maybe being typed). */
export function loadCardText(id: string) {
  const b = state.book;
  if (!b || state.boardText[id] !== undefined) return;
  return run(async () => {
    const text = await api.boardLoadText(b.id, id);
    if (state.book?.id === b.id && state.boardText[id] === undefined) setState("boardText", id, text);
  });
}

/** New empty card at `index` (default: the end), selected. */
export function createCard(index?: number) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    const { id, cards } = await api.boardCreate(b.id, index ?? state.board.length, "");
    setState({ board: cards, boardSel: id });
    setState("boardText", id, "");
  });
}

export function moveCard(id: string, index: number) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    setState("board", await api.boardMove(b.id, id, index));
  });
}

export function duplicateCard(id: string) {
  const b = state.book;
  if (!b) return;
  return run(async () => {
    await flushAll();
    const { id: copy, cards } = await api.boardDuplicate(b.id, id);
    setState({ board: cards, boardSel: copy });
    const text = state.boardText[id];
    if (text !== undefined) setState("boardText", copy, text);
  });
}

/** Deletes for good (no question: `requestCardDelete` is the user-facing entry). */
export function deleteCard(id: string) {
  const b = state.book;
  if (!b) return;
  dropCardEdit(id);
  return run(async () => {
    await flushAll();
    setState("board", await api.boardDelete(b.id, id));
    if (state.boardSel === id) setState("boardSel", null);
  });
}

export async function requestCardDelete(id: string) {
  const card = state.board.find((c) => c.id === id);
  if (!card) return;
  const ok = await askConfirm({
    title: "Excluir “" + (card.title.trim() || "Sem título") + "”?",
    message: "O cartão e o texto dele serão excluídos.",
    confirmLabel: "Excluir",
    danger: true,
  });
  if (ok) await deleteCard(id);
}
