import { describe, expect, it } from "vitest";
import { dropTarget } from "../../lib/tree";
import { cancelNodeRename, createNode, moveNode } from "../../store/actions/workspace";
import { state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { cardDropPos } from "./cardDrag";

describe("card drag", () => {
  it("the left half of a card drops before it, the right half after", () => {
    expect(cardDropPos(10, 220)).toBe("before");
    expect(cardDropPos(109, 220)).toBe("before");
    expect(cardDropPos(110, 220)).toBe("after");
    expect(cardDropPos(0, 0)).toBe("before");
  });

  it("dropping a card after a sibling reorders inside the same folder", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const folder = state.area[1].id;
    for (const i of [0, 1, 2]) {
      await createNode("text", { parent: folder, index: i });
      cancelNodeRename();
    }
    const [a, b, c] = state.area[1].children!.map((n) => n.id);
    // Same parent, index counted after taking the card out (what workspace_move expects).
    expect(dropTarget(state.area, a, c, "after")).toEqual({ parent: folder, index: 2 });
    await moveNode(a, c, "after");
    expect(state.area[1].children!.map((n) => n.id)).toEqual([b, c, a]);
    await moveNode(a, b, "before");
    expect(state.area[1].children!.map((n) => n.id)).toEqual([a, b, c]);
    // A card dropped on itself goes nowhere.
    expect(dropTarget(state.area, a, a, "after")).toBeNull();
  });
});
