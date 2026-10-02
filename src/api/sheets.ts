import { call } from "./invoke";
import type { SheetCreated, SheetField, SheetKind, Sheets, SheetValue } from "./types";

/** The book's sheets and templates; a book without them gets the starter templates. */
export const sheetsLoad = (bookId: string) => call<Sheets>("sheets_load", { bookId });

/** Replaces a kind's template (an empty field id is a new field); its sheets follow it. */
export const sheetsSetTemplate = (bookId: string, kind: SheetKind, fields: SheetField[]) =>
  call<Sheets>("sheets_set_template", { bookId, kind, fields });

export const sheetsCreate = (bookId: string, kind: SheetKind, name: string) =>
  call<SheetCreated>("sheets_create", { bookId, kind, name });

export const sheetsRename = (bookId: string, id: string, name: string) => call<void>("sheets_rename", { bookId, id, name });

/** One field of a sheet; null (or a value that says nothing) clears it. */
export const sheetsSetValue = (bookId: string, id: string, field: string, value: SheetValue | null) =>
  call<void>("sheets_set_value", { bookId, id, field, value });

export const sheetsDelete = (bookId: string, id: string) => call<Sheets>("sheets_delete", { bookId, id });
