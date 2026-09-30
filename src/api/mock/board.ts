import type { BoardCard, BoardCreated } from "../types";
import { CARD_TEXT_MAX, CARD_TITLE_MAX } from "../../lib/constants";
import { findBook, mockId, touch, type MockBook } from "./db";

// Mirrors `ops::board`: same order rules, limits and messages.

const cut = (s: string, max: number) => Array.from(s).slice(0, max).join("");

function cards(b: MockBook): BoardCard[] {
  b.board ??= [];
  b.boardText ??= {};
  return b.board;
}

function at(b: MockBook, id: string): number {
  const i = cards(b).findIndex((c) => c.id === id);
  if (i < 0) throw "Cartão não encontrado";
  return i;
}

type Ids = { bookId: string; id: string };

export const board = {
  board_list: ({ bookId }: { bookId: string }): BoardCard[] => cards(findBook(bookId)),

  board_create: ({ bookId, index, title }: { bookId: string; index: number; title: string }): BoardCreated => {
    const b = findBook(bookId);
    const card = { id: mockId(), title: cut(title, CARD_TITLE_MAX) };
    const list = cards(b);
    list.splice(Math.min(index, list.length), 0, card);
    touch(b);
    return { id: card.id, cards: list };
  },

  board_rename: ({ bookId, id, title }: Ids & { title: string }): BoardCard[] => {
    const b = findBook(bookId);
    cards(b)[at(b, id)].title = cut(title, CARD_TITLE_MAX);
    touch(b);
    return cards(b);
  },

  board_load_text: ({ bookId, id }: Ids): string => {
    const b = findBook(bookId);
    at(b, id);
    return b.boardText![id] ?? "";
  },

  board_save_text: ({ bookId, id, text }: Ids & { text: string }): void => {
    const b = findBook(bookId);
    at(b, id);
    b.boardText![id] = cut(text, CARD_TEXT_MAX);
    touch(b);
  },

  board_move: ({ bookId, id, index }: Ids & { index: number }): BoardCard[] => {
    const b = findBook(bookId);
    const list = cards(b);
    const [card] = list.splice(at(b, id), 1);
    list.splice(Math.min(index, list.length), 0, card);
    touch(b);
    return list;
  },

  board_delete: ({ bookId, id }: Ids): BoardCard[] => {
    const b = findBook(bookId);
    cards(b).splice(at(b, id), 1);
    delete b.boardText![id];
    touch(b);
    return cards(b);
  },

  board_duplicate: ({ bookId, id }: Ids): BoardCreated => {
    const b = findBook(bookId);
    const i = at(b, id);
    const copy = { id: mockId(), title: cut(cards(b)[i].title + " (cópia)", CARD_TITLE_MAX) };
    b.boardText![copy.id] = b.boardText![id] ?? "";
    cards(b).splice(i + 1, 0, copy);
    touch(b);
    return { id: copy.id, cards: cards(b) };
  },
};
