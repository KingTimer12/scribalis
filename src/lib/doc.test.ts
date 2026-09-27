import { describe, expect, it } from "vitest";
import { docWords } from "./doc";

describe("docWords", () => {
  it("counts paragraph words and skips separators/images", () => {
    expect(
      docWords({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "um dois" }, { type: "hardBreak" }, { type: "text", text: "três" }] },
          { type: "separator" },
          { type: "image", attrs: { src: "imagens/a.png" } },
          { type: "paragraph" },
        ],
      }),
    ).toBe(3);
  });
});
