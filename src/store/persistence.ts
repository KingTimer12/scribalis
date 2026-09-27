import { createEffect, onCleanup } from "solid-js";
import { unwrap } from "solid-js/store";
import { saveData } from "../lib/storage";
import { state } from "./state";

const SAVE_DELAY = 400;

/** Lê cada campo salvo para o efeito rastrear mudanças, sem serializar nada. */
function track() {
  const read = (..._: unknown[]) => {};
  for (const b of state.books) {
    read(b.title, b.cover, b.cur, b.updatedAt);
    for (const c of b.chapters) read(c.title, c.body, c.notes, c.status);
  }
  const p = state.prefs;
  read(p.theme, p.goal, p.width, p.font);
}

/** Salva obras e preferências (com debounce) sempre que algo muda. */
export function usePersistence() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    saveData({ books: unwrap(state.books), prefs: unwrap(state.prefs) });
  };

  createEffect(() => {
    track();
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY);
  });

  const onUnload = () => timer !== undefined && flush();
  window.addEventListener("beforeunload", onUnload);
  onCleanup(() => {
    window.removeEventListener("beforeunload", onUnload);
    onUnload();
  });
}
