import type { Panel } from "../../lib/types";
import { focusTarget, type FocusTarget } from "../focus";
import { openAreaNode } from "../selectors/workspace";
import { setState, state } from "../state";
import { mainTab } from "./tabs";

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Short message in the center of the bottom bar. */
export function flash(msg: string) {
  clearTimeout(toastTimer);
  setState({ toast: msg, toastKey: state.toastKey + 1, tripleHint: false });
  toastTimer = setTimeout(() => setState("toast", ""), 1800);
}

/** Shows a Rust/mock error as a toast. */
export const flashError = (e: unknown) => flash(typeof e === "string" ? e : "Algo deu errado");

/** Where focus rests on the current screen: the library grid, the text of an open chapter or text, or the tree. */
export function homeTarget(): FocusTarget {
  if (state.view === "library") return "lib";
  const kind = openAreaNode()?.kind;
  return kind === "chapter" || kind === "text" ? "body" : "tree";
}

/** Closes any panel and returns focus to the main screen. */
export function closePanel() {
  focusTarget(homeTarget());
  if (!state.panel) return;
  setState({ panel: null, q: "", pIdx: 0, prompt: null, hits: [] });
}

/** Opens a panel; closes it if already open. */
export function openPanel(name: Panel) {
  if (state.panel === name) return closePanel();
  focusTarget(name, name === "notes" ? "end" : null);
  setState({ panel: name, q: "", pIdx: 0, prompt: null, hits: [] });
}

export function toggleFocusMode() {
  // Focus mode is for writing: the board tab has no text being written.
  if (!state.focus && mainTab() === "board") return;
  const on = !state.focus;
  setState("focus", on);
  flash(on ? "Modo foco" : "Modo foco desligado");
}
