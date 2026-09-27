import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import type { DocJSON } from "../api/types";
import { currentDocKey, getDoc, loadDoc, normalizeDoc, sameKey, setEditor } from "./bridge";

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

/** Just enough of an Editor for loadDoc/getDoc: remembers the last content set. */
function fakeEditor(): Editor {
  let content: DocJSON = { type: "doc", content: [] };
  const chain = {
    setMeta: () => chain,
    setContent: (doc: DocJSON) => ((content = doc), chain),
    run: () => true,
  };
  return { chain: () => chain, getJSON: () => content } as unknown as Editor;
}

const para = (text: string): DocJSON => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const A = { bookId: "b1", chapterId: "c1" };
const B = { bookId: "b1", chapterId: "c2" };

describe("document key guard", () => {
  afterEach(() => setEditor(null));

  it("compares keys by book and chapter", () => {
    expect(sameKey(A, { ...A })).toBe(true);
    expect(sameKey(A, B)).toBe(false);
    expect(sameKey(A, { bookId: "b2", chapterId: "c1" })).toBe(false);
    expect(sameKey(null, A)).toBe(false);
  });

  it("only hands the document to a save for the chapter it holds", () => {
    setEditor(fakeEditor());
    loadDoc(para("velho"), A);
    expect(getDoc(A)).toEqual(para("velho"));
    loadDoc(para("novo"), B);
    // A late save still aimed at the old chapter must not get the new text.
    expect(getDoc(A)).toBeNull();
    expect(getDoc(B)).toEqual(para("novo"));
    expect(currentDocKey()).toEqual(B);
  });

  it("holds no chapter without an editor, and applies a pending load on mount", () => {
    setEditor(null);
    loadDoc(para("x"), A);
    expect(getDoc(A)).toBeNull();
    expect(currentDocKey()).toBeNull();
    setEditor(fakeEditor());
    expect(getDoc(A)).toEqual(para("x"));
  });

  it("a freshly mounted editor holds no chapter until a load", () => {
    setEditor(fakeEditor());
    loadDoc(para("x"), A);
    setEditor(fakeEditor());
    expect(getDoc(A)).toBeNull();
    expect(currentDocKey()).toBeNull();
  });
});
