import { cycleStatus, goChapter, moveChapter } from "./chapters";
import { goLibrary } from "./library";
import { currentBook, state } from "./state";
import { closePanel, openPanel, toggleFocusMode, toggleTheme } from "./ui";

/**
 * Global shortcuts. Lives on `window`, so it runs after field/panel handlers,
 * which can call stopPropagation to keep a key for themselves.
 */
export function rootKey(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  const k = (e.key || "").toLowerCase();
  const code = e.code || "";
  const ed = state.view === "editor";
  const cur = currentBook()?.cur ?? 0;
  let handled = true;

  if (mod && (k === "k" || code === "KeyK")) openPanel("palette");
  else if (mod && (k === "j" || code === "KeyJ")) toggleTheme();
  else if (mod && (k === "/" || k === "?" || code === "Slash" || code === "IntlRo" || code === "NumpadDivide"))
    openPanel("help");
  else if (ed && mod && (k === "o" || code === "KeyO")) goLibrary();
  else if (ed && mod && (k === "e" || code === "KeyE")) openPanel("index");
  else if (ed && mod && (k === "." || code === "Period")) toggleFocusMode();
  else if (ed && mod && (k === ";" || code === "Semicolon")) openPanel("notes");
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
