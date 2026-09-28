import { cycleStatus, goChapter, moveChapter } from "../actions/chapters";
import { insertChapterImage } from "../actions/images";
import { goLibrary } from "../actions/library";
import { toggleTheme } from "../actions/prefs";
import { goChapters, goWorkspace } from "../actions/tabs";
import { closePanel, openPanel, toggleFocusMode } from "../actions/ui";
import { state } from "../state";

/**
 * Global shortcuts. Lives on `window`, so it runs after field/panel handlers,
 * which can call stopPropagation to keep a key for themselves.
 */
export function rootKey(e: KeyboardEvent) {
  // The Scrivener import dialog is modal: it handles its own keys.
  if (state.scrivener) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = (e.key || "").toLowerCase();
  const code = e.code || "";
  const ed = state.view === "editor";
  const inBook = !!state.book && state.view !== "library";
  const tabKey = inBook && mod && !e.shiftKey && !e.altKey;
  const cur = state.book?.cur ?? 0;
  let handled = true;

  if (mod && (k === "k" || code === "KeyK")) openPanel("palette");
  else if (mod && !e.shiftKey && (k === "j" || code === "KeyJ")) toggleTheme();
  else if (mod && (k === "/" || k === "?" || code === "Slash" || code === "IntlRo" || code === "NumpadDivide")) openPanel("help");
  else if (inBook && mod && (k === "o" || code === "KeyO")) goLibrary();
  else if (tabKey && code === "Digit1") void goChapters();
  else if (tabKey && code === "Digit2") void goWorkspace();
  else if (mod && e.shiftKey && (k === "s" || code === "KeyS")) openPanel("cloud");
  else if (ed && mod && !e.shiftKey && (k === "e" || code === "KeyE")) openPanel("index");
  else if (ed && mod && (k === "." || code === "Period")) toggleFocusMode();
  else if (ed && mod && (k === ";" || code === "Semicolon")) openPanel("notes");
  else if (ed && mod && e.shiftKey && (k === "i" || code === "KeyI")) void insertChapterImage();
  else if (ed && e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.shiftKey) moveChapter(cur, dir);
    else goChapter(cur + dir);
  } else if (ed && e.altKey && !mod && code === "KeyS") cycleStatus();
  else if (e.key === "Escape") closePanel();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
