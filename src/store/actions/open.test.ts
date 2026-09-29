import { describe, expect, it } from "vitest";
import type { AreaNode } from "../../api/types";
import { initialNode } from "./open";

const ch = (id: string, missing = false): AreaNode => ({ id, kind: "chapter", title: id, notes: "", missing });
const items: AreaNode[] = [{ id: "m", kind: "manuscript", title: "M", notes: "", children: [ch("a", true), ch("b")] }];

describe("initialNode", () => {
  it("skips chapters whose file is missing", () => {
    expect(initialNode(items, "a")?.id).toBe("b");
    expect(initialNode(items, "b")?.id).toBe("b");
    expect(initialNode(items, null)?.id).toBe("b");
  });

  it("reopens a remembered folder or Manuscrito board", () => {
    expect(initialNode(items, "m")?.id).toBe("m");
  });

  it("gives nothing when every chapter is missing", () => {
    expect(initialNode([{ ...items[0], children: [ch("a", true)] }], "a")).toBeNull();
  });
});
