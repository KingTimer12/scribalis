import { describe, expect, it } from "vitest";
import type { AreaNode } from "../../api/types";
import { setState } from "../state";
import { homeTarget } from "./ui";

const node = (id: string, kind: AreaNode["kind"], children?: AreaNode[]): AreaNode => ({ id, kind, title: id, notes: "", children });
const area = [node("pasta", "folder", [node("texto", "text"), node("foto", "image")])];

describe("homeTarget", () => {
  it("rests on the library grid and on the chapter text", () => {
    setState({ view: "library" });
    expect(homeTarget()).toBe("lib");
    setState({ view: "editor" });
    expect(homeTarget()).toBe("body");
  });

  it("rests on the text only when the workspace shows one, else on the tree", () => {
    setState({ view: "workspace", area, areaOpen: "texto" });
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
