import { describe, expect, it, vi } from "vitest";
import { newBook } from "../../test/newBook";
import { cancelNodeRename, createNode } from "../actions/workspace";
import { setState, state } from "../state";
import { boardKey } from "./board";

/** A board element wired like the Corkboard, holding one textarea like a card's synopsis. */
function board(ids: string[], cols: number, openMenu = () => {}) {
  const el = document.createElement("div");
  const field = document.createElement("textarea");
  el.appendChild(field);
  el.addEventListener("keydown", (e) => boardKey(e, ids, cols, openMenu));
  const press = (key: string, from: HTMLElement = el, init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    from.dispatchEvent(e);
    return e;
  };
  return { el, field, press };
}

describe("boardKey", () => {
  it("arrows move the selection across the grid", () => {
    setState("areaSel", "a");
    const { press } = board(["a", "b", "c", "d"], 2);
    press("ArrowRight");
    expect(state.areaSel).toBe("b");
    press("ArrowDown");
    expect(state.areaSel).toBe("d");
    press("Home");
    expect(state.areaSel).toBe("a");
  });

  it("ignores keys typed into a card's synopsis", () => {
    setState("areaSel", "a");
    const menu = vi.fn();
    const { field, press } = board(["a", "b"], 2, menu);
    const e = press("ArrowRight", field);
    press("ContextMenu", field);
    expect(state.areaSel).toBe("a");
    expect(e.defaultPrevented).toBe(false);
    expect(menu).not.toHaveBeenCalled();
  });

  it("leaves Ctrl/Alt chords to the global shortcuts", () => {
    setState("areaSel", "a");
    const { press } = board(["a", "b"], 2);
    expect(press("ArrowRight", undefined, { altKey: true }).defaultPrevented).toBe(false);
    expect(state.areaSel).toBe("a");
  });

  it("Enter opens the selected card; the menu key opens its menu", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const folder = state.area[1].id;
    await createNode("text", { parent: folder, index: 0 });
    cancelNodeRename();
    const text = state.area[1].children![0].id;
    const menu = vi.fn();
    setState("areaSel", text);
    const { press } = board([text], 1, menu);
    press("ContextMenu");
    expect(menu).toHaveBeenCalledOnce();
    press("Enter");
    await vi.waitFor(() => expect(state.areaOpen).toBe(text));
  });
});
