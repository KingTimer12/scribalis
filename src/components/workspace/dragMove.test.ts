import { describe, expect, it } from "vitest";
import { dropPosAt } from "./dragMove";

describe("dropPosAt", () => {
  it("splits a folder row in quarters: before, inside, after", () => {
    expect(dropPosAt(2, 40, true)).toBe("before");
    expect(dropPosAt(9.9, 40, true)).toBe("before");
    expect(dropPosAt(10, 40, true)).toBe("inside");
    expect(dropPosAt(30, 40, true)).toBe("inside");
    expect(dropPosAt(31, 40, true)).toBe("after");
  });

  it("splits any other row in halves", () => {
    expect(dropPosAt(19, 40, false)).toBe("before");
    expect(dropPosAt(20, 40, false)).toBe("after");
  });

  it("treats a zero-height row as its middle", () => {
    expect(dropPosAt(0, 0, true)).toBe("inside");
    expect(dropPosAt(0, 0, false)).toBe("after");
  });
});
