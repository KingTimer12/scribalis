import { describe, expect, it } from "vitest";
import { cardDropIndex } from "./cardOrder";

const ids = ["a", "b", "c", "d"];

describe("cardDropIndex", () => {
  it("gives the index after taking the dragged card out", () => {
    expect(cardDropIndex(ids, "a", "c", "after")).toBe(2);
    expect(cardDropIndex(ids, "a", "c", "before")).toBe(1);
    expect(cardDropIndex(ids, "d", "a", "before")).toBe(0);
    expect(cardDropIndex(ids, "d", "b", "after")).toBe(2);
  });

  it("is null when nothing moves", () => {
    expect(cardDropIndex(ids, "b", "b", "after")).toBeNull();
    expect(cardDropIndex(ids, "b", "c", "before")).toBeNull();
    expect(cardDropIndex(ids, "b", "a", "after")).toBeNull();
    expect(cardDropIndex(ids, "zz", "a", "after")).toBeNull();
  });
});
