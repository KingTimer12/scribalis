import { call } from "./invoke";
import type { BoardCard, BoardCreated } from "./types";

// The book's board: free cards, each with a title and a text of its own.

export const boardList = (bookId: string) => call<BoardCard[]>("board_list", { bookId });
export const boardCreate = (bookId: string, index: number, title: string) =>
  call<BoardCreated>("board_create", { bookId, index, title });
export const boardRename = (bookId: string, id: string, title: string) =>
  call<BoardCard[]>("board_rename", { bookId, id, title });
export const boardLoadText = (bookId: string, id: string) => call<string>("board_load_text", { bookId, id });
export const boardSaveText = (bookId: string, id: string, text: string) =>
  call<void>("board_save_text", { bookId, id, text });
/** `index` is the position after taking the card out. */
export const boardMove = (bookId: string, id: string, index: number) =>
  call<BoardCard[]>("board_move", { bookId, id, index });
export const boardDelete = (bookId: string, id: string) => call<BoardCard[]>("board_delete", { bookId, id });
export const boardDuplicate = (bookId: string, id: string) => call<BoardCreated>("board_duplicate", { bookId, id });
