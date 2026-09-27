import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocJSON } from "../api/types";
import { loadDoc, setEditor } from "../editor/bridge";

const saves: { chapterId: string; text: string }[] = [];

vi.mock("../api/chapter", () => ({
  saveChapter: async (_bookId: string, chapterId: string, doc: DocJSON) => {
    saves.push({ chapterId, text: JSON.stringify(doc) });
    return { words: 0 };
  },
}));
vi.mock("../api/prefs", () => ({ statsToday: async () => ({ today: 0 }) }));

const { scheduleChapterSave, swapDocument } = await import("./saving");

/** Just enough of an Editor for the bridge; `type` simulates the user editing. */
function fakeEditor() {
  let content: DocJSON = { type: "doc", content: [] };
  const chain = { setMeta: () => chain, setContent: (d: DocJSON) => ((content = d), chain), run: () => true };
  const editor = { chain: () => chain, getJSON: () => content } as unknown as Editor;
  return { editor, type: (doc: DocJSON) => (content = doc) };
}

const para = (text: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const text = (doc: DocJSON) => JSON.stringify(doc);
const OLD = { bookId: "b", chapterId: "old" };
const NEW = { bookId: "b", chapterId: "new" };

describe("chapter text saves across a chapter switch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saves.length = 0;
  });
  afterEach(() => {
    setEditor(null);
    vi.useRealTimers();
  });

  it("a late debounced save never writes the new chapter's text into the old one", async () => {
    const ed = fakeEditor();
    setEditor(ed.editor);
    loadDoc(para("texto antigo"), OLD);
    ed.type(para("texto antigo!"));
    scheduleChapterSave();
    // The editor moves on before the debounce fires (e.g. a raw load elsewhere).
    loadDoc({ type: "doc", content: [] }, NEW);
    await vi.runAllTimersAsync();
    expect(saves.filter((s) => s.chapterId === "old")).toEqual([]);
  });

  it("swapDocument saves text typed into the old chapter before loading the new one", async () => {
    const ed = fakeEditor();
    setEditor(ed.editor);
    loadDoc(para("texto antigo"), OLD);
    // Typed during the IPC that fetches the next chapter.
    ed.type(para("texto antigo e mais"));
    scheduleChapterSave();
    const applied = vi.fn();
    expect(await swapDocument(para("novo"), NEW, applied)).toBe(true);
    expect(applied).toHaveBeenCalledOnce();
    expect(saves).toEqual([{ chapterId: "old", text: text(para("texto antigo e mais")) }]);
    await vi.runAllTimersAsync();
    expect(saves).toHaveLength(1);
  });

  it("swapDocument does not load when apply refuses (the user left the book)", async () => {
    const ed = fakeEditor();
    setEditor(ed.editor);
    loadDoc(para("fica"), OLD);
    expect(await swapDocument(para("novo"), NEW, () => false)).toBe(false);
    expect(ed.editor.getJSON()).toEqual(para("fica"));
  });
});
