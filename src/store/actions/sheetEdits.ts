import { produce } from "solid-js/store";
import * as api from "../../api/sheets";
import type { Sheet, SheetValue } from "../../api/types";
import { registerFlusher } from "../saving";
import { setState, state } from "../state";
import { run } from "./run";

// Typing in a sheet: the screen shows it at once, Rust gets it a moment later. The book is
// bound when typed, so a book switch cannot redirect it. Choices (select, yes/no) save at once.

const DELAY = 400;

/** `field: null` is the sheet's name. */
let pending: { bookId: string; id: string; field: string | null; value: SheetValue | null; timer: ReturnType<typeof setTimeout> } | null =
  null;

function editSheet(id: string, fn: (s: Sheet) => void) {
  setState(
    produce((s) => {
      const sheet = s.sheets?.sheets.find((x) => x.id === id);
      if (sheet) fn(sheet);
    }),
  );
}

function setLocal(id: string, field: string | null, value: SheetValue | null) {
  editSheet(id, (s) => {
    if (field === null) s.name = typeof value === "string" ? value : "";
    else if (value === null) delete s.values[field];
    else s.values[field] = value;
  });
}

function schedule(id: string, field: string | null, value: string) {
  const bookId = state.book?.id;
  if (!bookId) return;
  if (pending && (pending.id !== id || pending.field !== field || pending.bookId !== bookId)) void flushSheetEdit();
  if (pending) clearTimeout(pending.timer);
  setLocal(id, field, value);
  pending = { bookId, id, field, value, timer: setTimeout(() => void flushSheetEdit(), DELAY) };
}

export const scheduleSheetName = (id: string, name: string) => schedule(id, null, name);

/** A text field (input or textarea) typed into. */
export const scheduleSheetValue = (id: string, field: string, value: string) => schedule(id, field, value);

/** A select or yes/no field: saved right away. */
export function setSheetValueNow(id: string, field: string, value: SheetValue | null) {
  const bookId = state.book?.id;
  if (!bookId) return;
  void flushSheetEdit();
  setLocal(id, field, value);
  return run(() => api.sheetsSetValue(bookId, id, field, value));
}

/** Saves the pending edit now, if any: on leaving the sheet and in `flushAll`. */
export function flushSheetEdit() {
  const p = pending;
  pending = null;
  if (!p) return;
  clearTimeout(p.timer);
  return run(async () => {
    if (p.field === null) await api.sheetsRename(p.bookId, p.id, typeof p.value === "string" ? p.value : "");
    else await api.sheetsSetValue(p.bookId, p.id, p.field, p.value);
  });
}
registerFlusher(flushSheetEdit);
