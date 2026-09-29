import type { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { createWriterEditor } from "./createEditor";

function editor(separatorKey: boolean): Editor {
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
    separatorKey,
  });
}

const ctrlEnter = (ed: Editor) =>
  ed.view.someProp("handleKeyDown", (f) => f(ed.view, new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true })));
const separators = (ed: Editor) => (ed.getJSON().content ?? []).filter((b) => b.type === "separator").length;

describe("Ctrl Enter", () => {
  it("inserts a separator in chapters only", () => {
    const chapter = editor(true);
    ctrlEnter(chapter);
    expect(separators(chapter)).toBe(1);
    const free = editor(false);
    // The key falls through to the default keymap (a line break), never to a separator.
    ctrlEnter(free);
    expect(separators(free)).toBe(0);
    chapter.destroy();
    free.destroy();
  });
});
