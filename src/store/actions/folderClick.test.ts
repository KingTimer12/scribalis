import { describe, expect, it } from "vitest";
import { state } from "../state";
import { newBook } from "../../test/newBook";
import { openNode } from "./open";
import { cancelNodeRename, createNode } from "./workspace";

describe("opening a folder", () => {
  it("only folds or unfolds it: nothing opens in the main pane", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const id = state.area[1].id;
    await openNode(id, false);
    expect(state.areaOpen).toBeNull();
    expect(state.areaExpanded).toContain(id);
    await openNode(id, false);
    expect(state.areaExpanded).not.toContain(id);
  });
});
