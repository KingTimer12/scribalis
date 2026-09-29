import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { setState, state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { Corkboard } from "./Corkboard";

describe("Corkboard", () => {
  it("keeps its cards (and a focused synopsis) when the tree is replaced by a fresh copy", async () => {
    await newBook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => <Corkboard folder={state.area[0]} />, host);
    const before = host.querySelector("textarea");
    expect(before).not.toBeNull();
    setState("area", JSON.parse(JSON.stringify(state.area)));
    expect(host.querySelector("textarea")).toBe(before);
    dispose();
    host.remove();
  });
});
