import { describe, expect, it, vi } from "vitest";
import { cancelNodeRename, createNode } from "../../store/actions/workspace";
import { state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { boardNewMenu } from "./boardMenu";

describe("boardNewMenu", () => {
  it("offers Capítulo/Pasta in the Manuscrito and Texto/Pasta outside", async () => {
    await newBook();
    expect(boardNewMenu(state.area[0]).map((i) => i.label)).toEqual(["Capítulo", "Pasta"]);
    await createNode("folder");
    cancelNodeRename();
    expect(boardNewMenu(state.area[1]).map((i) => i.label)).toEqual(["Texto", "Pasta"]);
  });

  it("creates at the end of the board's folder", async () => {
    await newBook();
    await createNode("folder");
    cancelNodeRename();
    const folder = state.area[1];
    boardNewMenu(folder)[0].act();
    await vi.waitFor(() => expect(state.area[1].children?.length).toBe(1));
    expect(state.area[1].children![0].kind).toBe("text");
  });
});
