import { focusTarget } from "../focus";

/** Book name input in the top bar: Enter/↓ go to the chapter title. */
export function bookTitleKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === "ArrowDown") {
    e.preventDefault();
    focusTarget("title", "end");
  }
}

/** Chapter title: Enter/↓ go to the text. */
export function titleKey(e: KeyboardEvent) {
  if (e.key === "Enter" || (e.key === "ArrowDown" && !e.altKey)) {
    e.preventDefault();
    focusTarget("body", 0);
  }
}
