import { focusTarget } from "../focus";
import { state } from "../state";
import { updatePrefs } from "./prefs";
import { homeTarget } from "./ui";

/** The open book's tree sidebar is showing: open unless collapsed for this book. */
export const sidebarOpen = () => !!state.book && !state.prefs.sidebarClosed.includes(state.book.id);

/** « button and Ctrl E: collapses or reopens the tree for this book; saved in the Rust prefs. */
export function toggleSidebar() {
  const id = state.book?.id;
  if (!id) return;
  const wasOpen = sidebarOpen();
  const others = state.prefs.sidebarClosed.filter((x) => x !== id);
  updatePrefs({ sidebarClosed: wasOpen ? [...others, id] : others });
  // A collapsed tree cannot keep the keyboard: focus returns to the open text. A reopened tree takes it back.
  focusTarget(wasOpen ? homeTarget() : "tree");
}
