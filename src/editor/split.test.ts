import { describe, expect, it } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { splitAtCursor } from "./split";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    separator: { group: "block", atom: true },
    text: { group: "inline" },
  },
});

function stateWithCursorIn(blocks: string[], cursorBlock: number) {
  const doc = schema.node(
    "doc",
    null,
    blocks.map((t) => (t === "---" ? schema.node("separator") : schema.node("paragraph", null, t ? [schema.text(t)] : []))),
  );
  let pos = 0;
  for (let i = 0; i < cursorBlock; i++) pos += doc.child(i).nodeSize;
  const state = EditorState.create({ doc, schema });
  return state.apply(state.tr.setSelection(TextSelection.create(doc, pos + 1)));
}

describe("splitAtCursor", () => {
  it("splits on the second empty paragraph and moves the rest", () => {
    const state = stateWithCursorIn(["antes", "", "", "depois"], 2);
    const out = splitAtCursor(state);
    expect(out?.before.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "antes" }] }]);
    expect(out?.after.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "depois" }] }]);
  });

  it("trims empty paragraphs around the cut and keeps separators", () => {
    const state = stateWithCursorIn(["a", "", "", "", "", "---", "b"], 4);
    const out = splitAtCursor(state);
    expect(out?.before.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "a" }] }]);
    expect(out?.after.content.map((b) => b.type)).toEqual(["separator", "paragraph"]);
  });

  it("splits when Enter ×3 was pressed at the start of existing text", () => {
    // Two Enters at the start of "depois" leave two empty paragraphs before it.
    const state = stateWithCursorIn(["antes", "", "", "depois"], 3);
    const out = splitAtCursor(state);
    expect(out?.before.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "antes" }] }]);
    expect(out?.after.content).toEqual([{ type: "paragraph", content: [{ type: "text", text: "depois" }] }]);
  });

  it("does nothing when the previous paragraph has text", () => {
    expect(splitAtCursor(stateWithCursorIn(["a", ""], 1))).toBeNull();
    expect(splitAtCursor(stateWithCursorIn(["a", "", "b"], 2))).toBeNull();
  });
});
