import { describe, expect, it } from "vitest";
import type { AreaNode } from "../../api/types";
import { setState } from "../state";
import { homeTarget } from "./ui";

const node = (id: string, kind: AreaNode["kind"], children?: AreaNode[]): AreaNode => ({ id, kind, title: id, notes: "", children });
const area = [
  node("m", "manuscript", [node("cap", "chapter")]),
  node("pasta", "folder", [node("texto", "text"), node("foto", "image")]),
];

describe("homeTarget", () => {
  it("rests on the library grid", () => {
    setState({ view: "library" });
    expect(homeTarget()).toBe("lib");
  });

  it("in a book, rests on the text of an open chapter or text, else on the tree", () => {
    setState({ view: "book", area, areaOpen: "cap" });
    expect(homeTarget()).toBe("body");
    setState("areaOpen", "texto");
    expect(homeTarget()).toBe("body");
    setState("areaOpen", "foto");
    expect(homeTarget()).toBe("tree");
    setState("areaOpen", null);
    expect(homeTarget()).toBe("tree");
    // a stale id (node deleted meanwhile) counts as nothing open
    setState("areaOpen", "sumiu");
    expect(homeTarget()).toBe("tree");
  });
});
