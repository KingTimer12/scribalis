import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { readFormat } from "./format";

/** Just enough of an Editor for readFormat: marks plus the caret paragraph's attrs. */
function fakeEditor(marks: string[], attrs: Record<string, unknown>): Editor {
  return {
    isActive: (name: string) => marks.includes(name),
    state: { selection: { $from: { parent: { attrs } } } },
  } as unknown as Editor;
}

describe("readFormat", () => {
  it("reads active marks and paragraph attributes", () => {
    const editor = fakeEditor(["bold", "italic"], {
      textAlign: "center",
      lineHeight: 1.5,
      spaceBefore: 12,
      spaceAfter: 0,
      indent: 1.25,
    });
    expect(readFormat(editor)).toEqual({
      bold: true,
      italic: true,
      align: "center",
      lineHeight: 1.5,
      spaceBefore: 12,
      spaceAfter: 0,
      indent: 1.25,
    });
  });

  it("defaults to no marks, left alignment and null spacing", () => {
    const editor = fakeEditor([], { textAlign: null });
    expect(readFormat(editor)).toEqual({
      bold: false,
      italic: false,
      align: "left",
      lineHeight: null,
      spaceBefore: null,
      spaceAfter: null,
      indent: null,
    });
  });
});
