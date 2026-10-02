import { describe, expect, it } from "vitest";
import { state } from "../state";
import { newBook } from "../../test/newBook";
import { initialNode, openNode } from "./open";
import { cancelNodeRename, createNode } from "./workspace";

describe("opening a folder", () => {
  it("shows its board; opening it again folds or unfolds it", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const id = state.area[1].id;
    await openNode(id, false);
    expect(state.areaOpen).toBe(id);
    expect(state.areaExpanded).toContain(id);
    await openNode(id, false);
    expect(state.areaOpen).toBe(id);
    expect(state.areaExpanded).not.toContain(id);
  });

  it("a book reopens on a remembered folder board", async () => {
    await newBook();
    expect(initialNode(state.area, state.area[0].id)?.id).toBe(state.area[0].id);
  });
});
