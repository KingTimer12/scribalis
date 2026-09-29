import { cycleStatus, moveChapterStep } from "../actions/chapters";
import { insertChapterImage } from "../actions/images";
import { goLibrary } from "../actions/library";
import { goChapterStep } from "../actions/open";
import { toggleTheme } from "../actions/prefs";
import { closePanel, openPanel, toggleFocusMode } from "../actions/ui";
import { currentChapter } from "../selectors/book";
import { openAreaNode } from "../selectors/workspace";
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
  const inBook = !!state.book && state.view === "book";
  const chapter = inBook && !!currentChapter();
  const withNotes = inBook && (chapter || openAreaNode()?.kind === "text");
  let handled = true;

  if (mod && (k === "k" || code === "KeyK")) openPanel("palette");
  else if (mod && !e.shiftKey && (k === "j" || code === "KeyJ")) toggleTheme();
  else if (mod && (k === "/" || k === "?" || code === "Slash" || code === "IntlRo" || code === "NumpadDivide")) openPanel("help");
  else if (inBook && mod && (k === "o" || code === "KeyO")) goLibrary();
  else if (mod && e.shiftKey && (k === "s" || code === "KeyS")) openPanel("cloud");
  else if (inBook && mod && (k === "." || code === "Period")) toggleFocusMode();
  else if (withNotes && mod && (k === ";" || code === "Semicolon")) openPanel("notes");
  else if (chapter && mod && e.shiftKey && (k === "i" || code === "KeyI")) void insertChapterImage();
  else if (chapter && e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.shiftKey) void moveChapterStep(dir);
    else void goChapterStep(dir);
  } else if (chapter && e.altKey && !mod && code === "KeyS") cycleStatus();
  else if (e.key === "Escape") closePanel();
  else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
