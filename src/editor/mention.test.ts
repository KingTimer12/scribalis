import { describe, expect, it } from "vitest";
import type { DocJSON } from "../api/types";
import { createWriterEditor } from "./createEditor";
import { findQuery } from "./mentionSuggest";

function editor(lookup = (_id: string) => undefined as { name: string; kind: "character" } | undefined) {
  return createWriterEditor({
    element: document.createElement("div"),
    separator: () => ({ kind: "text", text: "* * *" }),
    resolveImage: () => null,
    onChange: () => {},
    onFormat: () => {},
    onHint: () => {},
    onExitTop: () => {},
    ariaLabel: "texto",
    placeholder: "",
    mentions: { lookup, onQuery: () => {}, onKey: () => false },
  });
}

const doc: DocJSON = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Viu " },
        { type: "mention", attrs: { id: "x1", label: "Ana" } },
        { type: "text", text: " chegar" },
      ],
    },
  ],
};

describe("mentions", () => {
  it("survive the editor and show the sheet's current name", () => {
    const ed = editor((id) => (id === "x1" ? { name: "Ana Lírio", kind: "character" } : undefined));
    ed.commands.setContent(doc);
    const p = doc.content[0];
    expect(ed.getJSON().content?.[0].content).toEqual(p.type === "paragraph" ? p.content : null);
    const chip = ed.view.dom.querySelector<HTMLElement>(".mention")!;
    expect(chip.textContent).toBe("@Ana Lírio");
    expect(chip.dataset.kind).toBe("character");
    ed.destroy();
  });

  it("a mention of a deleted sheet keeps its label, struck through", () => {
    const ed = editor();
    ed.commands.setContent(doc);
    const chip = ed.view.dom.querySelector<HTMLElement>(".mention")!;
    expect(chip.textContent).toBe("@Ana");
    expect(chip.classList.contains("gone")).toBe(true);
    ed.destroy();
  });

  it("@ opens a query only at a word start", () => {
    const ed = editor();
    ed.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Oi @Ana Lí" }] }] });
    ed.commands.focus("end");
    expect(findQuery(ed.view)).toMatchObject({ query: "Ana Lí", from: 4 });
    ed.commands.setContent({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "email@site" }] }] });
    ed.commands.focus("end");
    expect(findQuery(ed.view)).toBeNull();
    ed.destroy();
  });
});
