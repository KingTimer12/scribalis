import { COLS } from "../../lib/constants";
import { clearCover, pickCover } from "../actions/images";
import { cancelRename, commitRename, deleteBook, openBook, startNew, startRename } from "../actions/library";
import { focusTarget } from "../focus";
import { libList, libSelIndex } from "../selectors/library";
import { setState, state } from "../state";

const is = (e: KeyboardEvent, letter: string) => e.code === "Key" + letter.toUpperCase() || e.key.toLowerCase() === letter;

/** Book grid keys (only when the grid itself has focus). */
export function libKey(e: KeyboardEvent, gridEl: HTMLElement) {
  if (e.target !== gridEl) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const list = libList();
  const n = list.length;
  const sel = libSelIndex(list);
  const cur = list[sel];
  const k = e.key;
  const isDel = k === "Delete" || k === "Backspace";
  if (!isDel && state.libConfirm && k !== "Shift") setState("libConfirm", null);

  const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS } as Record<string, number>)[k];
  if (step) {
    e.preventDefault();
    if (!n) return;
    const next = sel + step;
    if (next >= 0 && next < n) setState("libSel", next);
    else if (step === COLS && Math.floor(sel / COLS) < Math.floor((n - 1) / COLS)) setState("libSel", n - 1);
  } else if (is(e, "c") && cur) {
    e.preventDefault();
    if (!e.shiftKey) pickCover(cur.id);
    else if (cur.cover) clearCover(cur.id);
  } else if (k === "Enter") {
    e.preventDefault();
    if (cur) openBook(cur.id);
  } else if (is(e, "n")) {
    e.preventDefault();
    startNew();
  } else if (is(e, "r") && cur) {
    e.preventDefault();
    startRename(cur.id);
  } else if (isDel && cur) {
    e.preventDefault();
    if (state.libConfirm === cur.id) deleteBook(cur.id);
    else setState("libConfirm", cur.id);
  } else if (k === "/") {
    e.preventDefault();
    focusTarget("libq", "end");
  } else if (k === "Escape" && (state.libConfirm || state.libQ)) {
    e.preventDefault();
    e.stopPropagation();
    setState({ libConfirm: null, libQ: "" });
  }
}

export function libQKey(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusTarget("lib");
  } else if (e.key === "Enter") {
    e.preventDefault();
    const list = libList();
    const b = list[libSelIndex(list)];
    if (b) openBook(b.id);
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    focusTarget("lib");
    setState({ libQ: "", libSel: 0 });
  }
}

export function renameKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    commitRename();
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    cancelRename();
  }
}
