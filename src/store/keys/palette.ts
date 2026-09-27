import { closePanel } from "../actions/ui";
import { runCommand, type Command } from "../commands/palette";
import { setState, state } from "../state";

export function paletteKey(e: KeyboardEvent, items: Command[]) {
  if (state.prompt) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      const { submit, value } = state.prompt;
      closePanel();
      submit(value.trim());
    }
    return;
  }
  const n = items.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    if (!n) return;
    const d = e.key === "ArrowDown" ? 1 : -1;
    setState("pIdx", (state.pIdx + d + n) % n);
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    const it = items[Math.min(state.pIdx, n - 1)];
    if (it) runCommand(it);
  }
}
