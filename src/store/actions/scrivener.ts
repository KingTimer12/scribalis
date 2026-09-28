import * as bookApi from "../../api/book";
import * as api from "../../api/scrivener";
import type { ImportResult, ImportTarget } from "../../api/types";
import { plural } from "../../lib/format";
import { defaultChosen, toggleChosen } from "../../lib/scrivenerChoice";
import { focusTarget } from "../focus";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { openBook, refreshLibrary } from "./library";
import { flash, flashError, homeTarget } from "./ui";
import { loadArea } from "./workspace";

/** "Importado: 3 capítulos, 5 itens · 1 item não pôde ser lido" */
export function importSummary(r: ImportResult): string {
  const base = "Importado: " + plural(r.chapters, "capítulo", "capítulos") + ", " + plural(r.items, "item", "itens");
  if (r.warnings === 0) return base;
  return base + " · " + (r.warnings === 1 ? "1 item não pôde ser lido" : plural(r.warnings, "item", "itens") + " não puderam ser lidos");
}

/** Picks a `.scriv` project, scans it and opens the dialog. Cancelling the picker does nothing. */
export async function startScrivenerImport(target: ImportTarget) {
  try {
    const path = await api.pickScrivener();
    if (!path) return;
    const view = await api.scanScrivener(path);
    setState({ panel: null, scrivener: { path, view, chosen: defaultChosen(view), target, busy: false } });
  } catch (e) {
    flashError(e);
  }
}

export function toggleScrivenerFolder(key: string) {
  const s = state.scrivener;
  if (!s || s.busy) return;
  setState("scrivener", "chosen", toggleChosen(s.view, s.chosen, key));
}

export function cancelScrivenerImport() {
  if (state.scrivener?.busy) return;
  setState("scrivener", null);
  focusTarget(homeTarget());
}

/** Runs the import; on error the dialog stays open so the choice can be retried. */
export async function confirmScrivenerImport() {
  const s = state.scrivener;
  if (!s || s.busy) return;
  setState("scrivener", "busy", true);
  try {
    await flushAll();
    const result = await api.importScrivener(s.path, [...s.chosen], s.target);
    setState("scrivener", null);
    if (s.target.type === "new") {
      await refreshLibrary();
      await openBook(result.bookId);
    } else if (state.book?.id === result.bookId) {
      const book = await bookApi.openBook(result.bookId);
      if (state.book?.id === book.id) setState("book", book);
      await loadArea();
      focusTarget(homeTarget());
    }
    flash(importSummary(result));
  } catch (e) {
    if (state.scrivener) setState("scrivener", "busy", false);
    flashError(e);
  }
}
