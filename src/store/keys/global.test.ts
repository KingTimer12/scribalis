import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "../../lib/constants";
import { setState, state } from "../state";
import { rootKey } from "./global";

function press(key: string, code: string, init: KeyboardEventInit = {}) {
  const e = new KeyboardEvent("keydown", { key, code, ctrlKey: true, cancelable: true, ...init });
  rootKey(e);
  return e;
}

describe("text size shortcuts", () => {
  it("Ctrl = and Ctrl + grow the text, Ctrl - shrinks it, Ctrl 0 resets it", () => {
    setState("prefs", { ...DEFAULT_PREFS, textPx: 20 });
    expect(press("=", "Equal").defaultPrevented).toBe(true);
    expect(state.prefs.textPx).toBe(22);
    press("+", "Equal", { shiftKey: true });
    expect(state.prefs.textPx).toBe(24);
    press("+", "NumpadAdd");
    expect(state.prefs.textPx).toBe(26);
    expect(press("-", "Minus").defaultPrevented).toBe(true);
    press("-", "NumpadSubtract");
    expect(state.prefs.textPx).toBe(22);
    expect(press("0", "Digit0").defaultPrevented).toBe(true);
    expect(state.prefs.textPx).toBe(20);
  });

  it("leaves AltGr chords and plain keys alone", () => {
    setState("prefs", { ...DEFAULT_PREFS, textPx: 20 });
    expect(press("}", "Digit0", { altKey: true }).defaultPrevented).toBe(false);
    expect(press("=", "Equal", { ctrlKey: false }).defaultPrevented).toBe(false);
    expect(state.prefs.textPx).toBe(20);
  });
});

describe("Escape", () => {
  it("exits focus mode when no panel is open to close instead", () => {
    setState({ panel: null, focus: true });
    expect(press("Escape", "Escape", { ctrlKey: false }).defaultPrevented).toBe(true);
    expect(state.focus).toBe(false);
  });

  it("closes an open panel first, leaving focus mode alone", () => {
    setState({ panel: "notes", focus: true });
    press("Escape", "Escape", { ctrlKey: false });
    expect(state.panel).toBeNull();
    expect(state.focus).toBe(true);
  });

  it("does nothing focus-related with neither a panel nor focus mode open", () => {
    setState({ panel: null, focus: false });
    expect(press("Escape", "Escape", { ctrlKey: false }).defaultPrevented).toBe(true);
    expect(state.focus).toBe(false);
  });
});
