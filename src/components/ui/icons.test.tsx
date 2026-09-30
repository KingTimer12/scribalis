import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import * as icons from "./icons";

describe("icons", () => {
  it("render hidden, stroked 24×24 SVGs at 16 px unless sized", () => {
    const host = document.createElement("div");
    const all = Object.values(icons);
    const dispose = render(() => <>{all.map((Icon) => <Icon />)}<icons.IconPlus size={24} /></>, host);
    const svgs = [...host.querySelectorAll("svg")];
    expect(svgs).toHaveLength(all.length + 1);
    for (const s of svgs.slice(0, -1)) {
      expect([s.getAttribute("width"), s.getAttribute("viewBox"), s.getAttribute("aria-hidden")]).toEqual(["16", "0 0 24 24", "true"]);
      expect(s.getAttribute("stroke")).toBe("currentColor");
    }
    expect(svgs[svgs.length - 1].getAttribute("width")).toBe("24");
    dispose();
  });
});
