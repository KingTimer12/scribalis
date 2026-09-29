import { describe, expect, it } from "vitest";
import { newBook } from "../../test/newBook";
import { setState, state } from "../state";
import { openNode } from "./open";
import { toggleFocusMode } from "./ui";
import { cancelNodeRename, createNode } from "./workspace";

describe("opening a board", () => {
  it("opens a folder's board, unfolds it and remembers it; opening it again folds it", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const id = state.area[1].id;
    await openNode(id, false);
    expect(state.areaOpen).toBe(id);
    expect(state.areaSel).toBe(id);
    expect(state.areaExpanded).toContain(id);
    expect(state.book?.open).toBe(id);
    await openNode(id, false);
    expect(state.areaOpen).toBe(id);
    expect(state.areaExpanded).not.toContain(id);
  });

  it("the Manuscrito opens as a board and leaves focus mode", async () => {
    await newBook();
    setState("focus", true);
    await openNode(state.area[0].id, false);
    expect(state.areaOpen).toBe(state.area[0].id);
    expect(state.focus).toBe(false);
  });

  it("focus mode does not turn on over a board", async () => {
    await newBook();
    await openNode(state.area[0].id, false);
    toggleFocusMode();
    expect(state.focus).toBe(false);
  });
});
