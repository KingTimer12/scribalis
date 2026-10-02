import type { Editor as TipTap } from "@tiptap/core";
import { onCleanup, onMount } from "solid-js";
import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { DocJSON } from "../../api/types";
import { currentDocKey, setEditor } from "../../editor/bridge";

/** Just enough of an Editor for the bridge; `type` simulates the user editing. */
const fake = (() => {
  let content: DocJSON = { type: "doc", content: [] };
  const chain = { setMeta: () => chain, setContent: (d: DocJSON) => ((content = d), chain), run: () => true };
  const editor = { chain: () => chain, getJSON: () => content } as unknown as TipTap;
  return { editor, type: (doc: DocJSON) => (content = doc) };
})();

// The chapter pane mounts and unmounts the editor exactly like RichEditor does.
vi.mock("../editor/Editor", () => ({
  Editor: () => {
    onMount(() => {
      setEditor(fake.editor);
      onCleanup(() => setEditor(null));
    });
    return <div class="fake-editor" />;
  },
}));

const { openBook } = await import("../../store/actions/library");
const { setMainTab } = await import("../../store/actions/tabs");
const { loadArea } = await import("../../store/actions/workspace");
const { flushAll, scheduleDocSave } = await import("../../store/saving");
const { state } = await import("../../store/state");
const { newBook } = await import("../../test/newBook");
const { MainTabs } = await import("./MainTabs");

/** The Quadro tab only exists for a document with subdocuments: gives the open chapter one. */
async function addSubchapter(bookId: string, parent: string) {
  await mockInvoke("workspace_create", { bookId, parent, index: 0, kind: "chapter", title: "Cena" });
  await loadArea();
}

const para = (text: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

describe("MainTabs", () => {
  it("shows the tabs only for a document with subdocuments", async () => {
    const book = await newBook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => <MainTabs />, host);
    await openBook(book.id);
    expect(host.querySelector(".ws-tabs")).toBeNull();
    await addSubchapter(book.id, state.areaOpen!);
    expect(host.querySelector(".ws-tabs")).not.toBeNull();
    setMainTab("board");
    expect(host.querySelector(".board [data-card-id]")).not.toBeNull();
    setMainTab("editor");
    dispose();
    host.remove();
  });

  it("Editor → Quadro → Editor keeps the open chapter in the editor and saves the text typed before", async () => {
    const book = await newBook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => <MainTabs />, host);
    await openBook(book.id);
    const chapterId = state.areaOpen!;
    await addSubchapter(book.id, chapterId);
    expect(currentDocKey()).toMatchObject({ docId: chapterId, scope: "chapter" });

    fake.type(para("Antes do quadro"));
    scheduleDocSave();
    setMainTab("board");
    expect(host.querySelector(".ws-pane")!.hasAttribute("hidden")).toBe(true);
    expect(host.querySelector(".fake-editor")).not.toBeNull();
    setMainTab("editor");
    expect(host.querySelector(".ws-pane")!.hasAttribute("hidden")).toBe(false);

    // Still holds the chapter: text typed now is saved too.
    expect(currentDocKey()).toMatchObject({ docId: chapterId, scope: "chapter" });
    fake.type(para("Depois do quadro"));
    scheduleDocSave();
    await flushAll();
    expect(await mockInvoke<DocJSON>("chapter_load", { bookId: book.id, chapterId })).toEqual(para("Depois do quadro"));
    dispose();
    host.remove();
  });

  it("switching tabs lands the pending text save right away", async () => {
    const book = await newBook();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const dispose = render(() => <MainTabs />, host);
    await openBook(book.id);
    const chapterId = state.areaOpen!;
    await addSubchapter(book.id, chapterId);
    fake.type(para("Salvo na troca"));
    scheduleDocSave();
    setMainTab("board");
    // The debounce (800ms) has not elapsed: only the tab switch's flush can have saved it.
    await vi.waitFor(async () =>
      expect(await mockInvoke<DocJSON>("chapter_load", { bookId: book.id, chapterId })).toEqual(para("Salvo na troca")),
    { timeout: 300 });
    setMainTab("editor");
    dispose();
    host.remove();
  });
});
