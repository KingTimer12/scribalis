import { describe, expect, it, vi } from "vitest";
import { setState, state } from "../state";
import { boardKey } from "./board";
import { cardFieldKey } from "./cardField";

function board(ids: string[], cols: number, edit = vi.fn(), openMenu = vi.fn()) {
  const el = document.createElement("div");
  const field = document.createElement("textarea");
  el.appendChild(field);
  el.addEventListener("keydown", (e) => boardKey(e, ids, cols, edit, openMenu));
  const press = (key: string, from: HTMLElement = el, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    from.dispatchEvent(e);
    return e;
  };
  return { field, press, edit, openMenu };
}

describe("boardKey", () => {
  it("arrows move the selection; Enter edits; menu key opens the menu", () => {
    setState("boardSel", "a");
    const { press, edit, openMenu } = board(["a", "b", "c", "d"], 2);
    press("ArrowRight");
    expect(state.boardSel).toBe("b");
    press("ArrowDown");
    expect(state.boardSel).toBe("d");
    press("Enter");
    expect(edit).toHaveBeenCalledWith("d");
    press("ContextMenu");
    expect(openMenu).toHaveBeenCalledOnce();
  });

  it("ignores keys that come from a card field and Ctrl/Alt chords", () => {
    setState("boardSel", "a");
    const { field, press } = board(["a", "b"], 2);
    press("ArrowRight", field);
    press("ArrowRight", undefined, { ctrlKey: true });
    expect(state.boardSel).toBe("a");
  });
});

describe("card field keys", () => {
  const fire = (key: string, init: KeyboardEventInit = {}) => {
    const outer = vi.fn();
    const wrap = document.createElement("div");
    const field = document.createElement("input");
    wrap.appendChild(field);
    wrap.addEventListener("keydown", outer);
    const onEscape = vi.fn();
    const onEnter = vi.fn();
    field.addEventListener("keydown", (e) => cardFieldKey(e, onEscape, onEnter));
    field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
    return { outer, onEscape, onEnter };
  };

  it("keeps plain keys inside the field", () => {
    expect(fire("n").outer).not.toHaveBeenCalled();
    expect(fire("Delete").outer).not.toHaveBeenCalled();
  });

  it("lets Ctrl/Cmd chords reach the global shortcuts", () => {
    expect(fire("k", { ctrlKey: true }).outer).toHaveBeenCalled();
    expect(fire("o", { metaKey: true }).outer).toHaveBeenCalled();
  });

  it("Esc and Enter call back", () => {
    expect(fire("Escape").onEscape).toHaveBeenCalled();
    expect(fire("Enter").onEnter).toHaveBeenCalled();
  });
});
