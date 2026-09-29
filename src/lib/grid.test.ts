import { describe, expect, it } from "vitest";
import { gridStep } from "./grid";

// 7 cards, 3 per row:  0 1 2 / 3 4 5 / 6
describe("gridStep", () => {
  it("moves left and right along the reading order, stopping at the ends", () => {
    expect(gridStep(1, 7, 3, "ArrowRight")).toBe(2);
    expect(gridStep(2, 7, 3, "ArrowRight")).toBe(3);
    expect(gridStep(6, 7, 3, "ArrowRight")).toBe(6);
    expect(gridStep(0, 7, 3, "ArrowLeft")).toBe(0);
  });

  it("moves up and down by a row; down into a short last row lands on its last card", () => {
    expect(gridStep(4, 7, 3, "ArrowUp")).toBe(1);
    expect(gridStep(1, 7, 3, "ArrowUp")).toBe(1);
    expect(gridStep(1, 7, 3, "ArrowDown")).toBe(4);
    expect(gridStep(5, 7, 3, "ArrowDown")).toBe(6);
    expect(gridStep(6, 7, 3, "ArrowDown")).toBe(6);
  });

  it("Home and End, no selection and no cards", () => {
    expect(gridStep(4, 7, 3, "Home")).toBe(0);
    expect(gridStep(1, 7, 3, "End")).toBe(6);
    expect(gridStep(-1, 7, 3, "ArrowDown")).toBe(0);
    expect(gridStep(-1, 0, 3, "ArrowRight")).toBe(-1);
    expect(gridStep(2, 7, 0, "ArrowDown")).toBe(3);
  });
});
