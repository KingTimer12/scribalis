import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocJSON } from "../api/types";
import { loadDoc, setEditor } from "../editor/bridge";

const saves: { chapterId: string; text: string }[] = [];
const areaSaves: { bookId: string; id: string; text: string }[] = [];
let statsTodayCalls = 0;

vi.mock("../api/chapter", () => ({
  saveChapter: async (_bookId: string, chapterId: string, doc: DocJSON) => {
    saves.push({ chapterId, text: JSON.stringify(doc) });
    return { words: 0 };
  },
}));
vi.mock("../api/prefs", () => ({
  statsToday: async () => {
    statsTodayCalls += 1;
    return { today: 0 };
  },
}));
vi.mock("../api/workspace", () => ({
  saveAreaDoc: async (bookId: string, id: string, doc: DocJSON) => {
    areaSaves.push({ bookId, id, text: JSON.stringify(doc) });
  },
  loadAreaDoc: async () => ({ type: "doc", content: [] }) satisfies DocJSON,
}));

const { scheduleDocSave, swapDocument } = await import("./saving");

/** Just enough of an Editor for the bridge; `type` simulates the user editing. */
function fakeEditor() {
  let content: DocJSON = { type: "doc", content: [] };
  const chain = { setMeta: () => chain, setContent: (d: DocJSON) => ((content = d), chain), run: () => true };
  const editor = { chain: () => chain, getJSON: () => content } as unknown as Editor;
  return { editor, type: (doc: DocJSON) => (content = doc) };
}

const para = (text: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const text = (doc: DocJSON) => JSON.stringify(doc);
const OLD = { bookId: "b", docId: "old", scope: "chapter" as const };
const NEW = { bookId: "b", docId: "new", scope: "chapter" as const };
const AREA = { bookId: "b", docId: "notes", scope: "area" as const };

describe("chapter text saves across a chapter switch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saves.length = 0;
    areaSaves.length = 0;
    statsTodayCalls = 0;
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
    scheduleDocSave();
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
    scheduleDocSave();
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

  it("an area key saves through workspace_save_doc, never chapter_save nor stats_today", async () => {
    const ed = fakeEditor();
    setEditor(ed.editor);
    loadDoc(para("rascunho da área"), AREA);
    ed.type(para("rascunho da área editado"));
    scheduleDocSave();
    await vi.runAllTimersAsync();
    expect(areaSaves).toEqual([{ bookId: "b", id: "notes", text: text(para("rascunho da área editado")) }]);
    expect(saves).toEqual([]);
    expect(statsTodayCalls).toBe(0);
  });

  it("switching from a pending area key to a chapter key saves the pending text to the area doc, never the chapter", async () => {
    const ed = fakeEditor();
    setEditor(ed.editor);
    loadDoc(para("área antiga"), AREA);
    // Typed during the IPC that fetches the chapter.
    ed.type(para("área antiga e mais"));
    scheduleDocSave();
    const applied = vi.fn();
    expect(await swapDocument(para("capítulo novo"), NEW, applied)).toBe(true);
    expect(applied).toHaveBeenCalledOnce();
    expect(areaSaves).toEqual([{ bookId: "b", id: "notes", text: text(para("área antiga e mais")) }]);
    expect(saves).toEqual([]);
    await vi.runAllTimersAsync();
    expect(saves).toEqual([]);
    expect(areaSaves).toHaveLength(1);
  });
});
