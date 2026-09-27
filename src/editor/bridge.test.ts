import { describe, expect, it } from "vitest";
import type { DocJSON } from "../api/types";
import { normalizeDoc } from "./bridge";

describe("normalizeDoc", () => {
  it("turns an empty doc into one with a single empty paragraph", () => {
    const doc: DocJSON = { type: "doc", content: [] };
    expect(normalizeDoc(doc)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("leaves a non-empty doc unchanged", () => {
    const doc: DocJSON = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] };
    expect(normalizeDoc(doc)).toEqual(doc);
    expect(normalizeDoc(doc)).toBe(doc);
  });
});
