/**
 * Keys typed into a card's title or text: plain keys belong to the field (the board and the
 * tree must not see them); Ctrl/Cmd chords go on to the global shortcuts. Esc and Enter
 * (title only) call back.
 */
export function cardFieldKey(e: KeyboardEvent, onEscape: () => void, onEnter?: () => void) {
  if (e.ctrlKey || e.metaKey) return;
  e.stopPropagation();
  if (e.key === "Escape") {
    e.preventDefault();
    onEscape();
  } else if (e.key === "Enter" && onEnter) {
    e.preventDefault();
    onEnter();
  }
}
