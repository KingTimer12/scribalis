import { cycleStatus, moveChapterStep } from "../actions/chapters";
import { insertChapterImage } from "../actions/images";
import { goLibrary } from "../actions/library";
import { goChapterStep } from "../actions/open";
import { textBigger, textReset, textSmaller, toggleTheme } from "../actions/prefs";
import { toggleSidebar } from "../actions/sidebar";
import { toggleBookTab } from "../actions/sheets";
import { boardNode } from "../selectors/board";
import { closePanel, openBookPanel, openPanel, openSettings, toggleFocusMode } from "../actions/ui";
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
  // Writing shortcuts stay off while the sheets cover the tree and the editor.
  const writing = inBook && state.bookTab === "write";
  const chapter = writing && !!currentChapter();
  const withNotes = writing && (chapter || openAreaNode()?.kind === "text");
  let handled = true;

  if (mod && (k === "k" || code === "KeyK")) openPanel("palette");
  else if (mod && !e.shiftKey && (k === "j" || code === "KeyJ")) toggleTheme();
  // Text size; Alt is excluded so AltGr chords (Ctrl+Alt on Windows) still type their character.
  else if (mod && !e.altKey && (k === "=" || k === "+" || code === "Equal" || code === "NumpadAdd")) textBigger();
  else if (mod && !e.altKey && (k === "-" || code === "Minus" || code === "NumpadSubtract")) textSmaller();
  else if (mod && !e.altKey && (k === "0" || code === "Digit0" || code === "Numpad0")) textReset();
  else if (mod && (k === "/" || k === "?" || code === "Slash" || code === "IntlRo" || code === "NumpadDivide")) openPanel("help");
  else if (mod && (k === "," || code === "Comma")) openSettings();
  else if (inBook && mod && (k === "o" || code === "KeyO")) goLibrary();
  else if (writing && mod && !e.shiftKey && (k === "e" || code === "KeyE")) toggleSidebar();
  else if (inBook && mod && e.shiftKey && (k === "f" || code === "KeyF")) void toggleBookTab();
  else if (mod && e.shiftKey && (k === "s" || code === "KeyS")) openBookPanel();
  else if (writing && mod && (k === "." || code === "Period")) toggleFocusMode();
  else if (withNotes && mod && (k === ";" || code === "Semicolon")) openPanel("notes");
  // On the Quadro the chapter editor is hidden: nothing to insert an image into.
  else if (chapter && !boardNode() && mod && e.shiftKey && (k === "i" || code === "KeyI")) void insertChapterImage();
  else if (chapter && e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.shiftKey) void moveChapterStep(dir);
    else void goChapterStep(dir);
  } else if (chapter && e.altKey && !mod && code === "KeyS") cycleStatus();
  else if (e.key === "Escape") {
    // Panels/dialogs/menus that want Esc for themselves stop propagation before it gets here
    // (ConfirmDialog, ContextMenu, rename fields...), so reaching this point with no panel open
    // means focus mode (if on) is the only thing left for Esc to close.
    if (!state.panel && state.focus) toggleFocusMode();
    else closePanel();
  } else handled = false;

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
}
