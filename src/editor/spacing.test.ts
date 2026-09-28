import { describe, expect, it } from "vitest";
import { readMarkedSpacing, readSpacing, SPACING_MARKER_ATTR, spacingRenderAttrs, spacingStyle } from "./spacing";

describe("paragraph spacing attributes", () => {
  it("renders CSS with the stored units", () => {
    expect(spacingStyle("lineHeight", 1.5)).toBe("line-height: 1.5");
    expect(spacingStyle("spaceBefore", 12)).toBe("margin-top: 12pt");
    expect(spacingStyle("spaceAfter", 0)).toBe("margin-bottom: 0pt");
    expect(spacingStyle("indent", 1.25)).toBe("text-indent: 1.25cm");
    expect(spacingStyle("indent", null)).toBeNull();
  });

  it("reads back only the units it writes", () => {
    const style = { lineHeight: "1.5", marginTop: "12pt", marginBottom: "0pt", textIndent: "1.25cm" };
    expect(readSpacing("lineHeight", style)).toBe(1.5);
    expect(readSpacing("spaceBefore", style)).toBe(12);
    expect(readSpacing("spaceAfter", style)).toBe(0);
    expect(readSpacing("indent", style)).toBe(1.25);
    // Pasted HTML in other units is dropped, not misread.
    expect(readSpacing("lineHeight", { lineHeight: "24px" })).toBeNull();
    expect(readSpacing("spaceBefore", { marginTop: "1em" })).toBeNull();
    expect(readSpacing("indent", { textIndent: "" })).toBeNull();
  });
});

describe("the paste marker", () => {
  it("renders the marker attribute alongside the style, only when a value is set", () => {
    expect(spacingRenderAttrs("spaceAfter", 0)).toEqual({ style: "margin-bottom: 0pt", [SPACING_MARKER_ATTR]: "" });
    expect(spacingRenderAttrs("indent", null)).toEqual({});
  });

  it("reads spacing back only from elements carrying the marker", () => {
    const marked = { hasAttribute: () => true, style: { marginTop: "12pt" } };
    const unmarked = { hasAttribute: () => false, style: { marginTop: "12pt" } };
    expect(readMarkedSpacing("spaceBefore", marked)).toBe(12);
    // Google Docs pastes `<p style="margin-top:0pt;...">` on every paragraph;
    // without our marker, that must not become spacing.
    expect(readMarkedSpacing("spaceBefore", unmarked)).toBeNull();
  });
});
