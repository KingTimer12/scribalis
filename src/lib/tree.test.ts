import { describe, expect, it } from "vitest";
import type { AreaNode } from "../api/types";
import { ancestors, dropTarget, locate, visibleRows } from "./tree";

const n = (id: string, kind: AreaNode["kind"], children?: AreaNode[]): AreaNode => ({ id, kind, title: id, notes: "", children });
const items: AreaNode[] = [n("a", "folder", [n("b", "text"), n("c", "image")]), n("d", "folder", [n("e", "folder")]), n("f", "file")];

describe("workspace tree helpers", () => {
  it("lists only rows under expanded folders", () => {
    expect(visibleRows(items, new Set()).map((r) => r.node.id)).toEqual(["a", "d", "f"]);
    const rows = visibleRows(items, new Set(["a"]));
    expect(rows.map((r) => [r.node.id, r.depth, r.parent])).toEqual([["a", 0, null], ["b", 1, "a"], ["c", 1, "a"], ["d", 0, null], ["f", 0, null]]);
  });

  it("locates parent and index", () => {
    expect(locate(items, "c")).toEqual({ parent: "a", index: 1 });
    expect(locate(items, "zz")).toBeNull();
  });

  it("computes drop targets with the index after removal", () => {
    expect(dropTarget(items, "f", "b", "after")).toEqual({ parent: "a", index: 1 });
    expect(dropTarget(items, "a", "f", "after")).toEqual({ parent: null, index: 2 });
    expect(dropTarget(items, "f", "a", "before")).toEqual({ parent: null, index: 0 });
    expect(dropTarget(items, "b", "d", "inside")).toEqual({ parent: "d", index: 1 });
  });

  it("refuses drops onto itself, into its own subtree or inside an image or attachment", () => {
    expect(dropTarget(items, "d", "d", "inside")).toBeNull();
    expect(dropTarget(items, "d", "e", "inside")).toBeNull();
    expect(dropTarget(items, "d", "e", "before")).toBeNull();
    expect(dropTarget(items, "f", "c", "inside")).toBeNull();
    expect(dropTarget(items, "b", "f", "inside")).toBeNull();
  });

  it("drops inside a document as a subdocument", () => {
    expect(dropTarget(items, "f", "b", "inside")).toEqual({ parent: "b", index: 0 });
  });
});

describe("drop rules around the Manuscrito", () => {
  const tree: AreaNode[] = [
    n("m", "manuscript", [n("c1", "chapter"), n("c2", "chapter")]),
    n("f", "folder", [n("t", "text")]),
  ];

  it("never drags the Manuscrito, never drops before it at the root", () => {
    expect(dropTarget(tree, "m", "f", "after")).toBeNull();
    expect(dropTarget(tree, "t", "m", "before")).toBeNull();
    expect(dropTarget(tree, "f", "m", "after")).toEqual({ parent: null, index: 1 });
  });

  it("drops inside the Manuscrito like inside a folder", () => {
    expect(dropTarget(tree, "t", "m", "inside")).toEqual({ parent: "m", index: 2 });
    // Inside a chapter: a subchapter.
    expect(dropTarget(tree, "c2", "c1", "inside")).toEqual({ parent: "c1", index: 0 });
  });

  it("lists a node's ancestors, nearest last", () => {
    expect(ancestors(tree, "t")).toEqual(["f"]);
    expect(ancestors(tree, "c2")).toEqual(["m"]);
    expect(ancestors(tree, null)).toEqual([]);
  });
});
