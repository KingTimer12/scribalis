import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { TreeRow } from "./TreeRow";

describe("TreeRow", () => {
  it("the chevron only folds or unfolds: it never opens the folder's board", async () => {
    await newBook();
    const m = state.area[0];
    const host = document.createElement("div");
    // Solid delegates clicks to the document: the row must be attached.
    document.body.appendChild(host);
    const dispose = render(() => <TreeRow row={{ node: m, depth: 0, parent: null }} onMenu={() => {}} />, host);
    host.querySelector<HTMLElement>(".ws-chev")!.click();
    expect(state.areaExpanded).toContain(m.id);
    expect(state.areaOpen).toBeNull();
    host.querySelector<HTMLElement>(".ws-chev")!.click();
    expect(state.areaExpanded).not.toContain(m.id);
    dispose();
    host.remove();
  });

  it("the '⋯' button opens the row's menu without opening it or selecting the tree background", async () => {
    await newBook();
    const m = state.area[0];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const onMenu = vi.fn();
    const dispose = render(() => <TreeRow row={{ node: m, depth: 0, parent: null }} onMenu={onMenu} />, host);
    host.querySelector<HTMLButtonElement>(".row-more")!.click();
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(state.areaOpen).toBeNull();
    dispose();
    host.remove();
  });
});
