import { describe, expect, it } from "vitest";
import type { AreaNode } from "../api/types";
import {
  chapterCount, chapterNumber, chapterOrder, displayTitle, inManuscript, manuscriptOf, manuscriptWords,
} from "./manuscript";
import { isContainer } from "./tree";

const ch = (id: string, words: number, title = ""): AreaNode => ({ id, kind: "chapter", title, notes: "", status: "rascunho", words });
const items: AreaNode[] = [
  { id: "m", kind: "manuscript", title: "Manuscrito", notes: "", children: [
    { id: "p", kind: "folder", title: "Parte 1", notes: "", children: [ch("c1", 10, "Início"), ch("c2", 5)] },
    ch("c3", 1),
  ] },
  { id: "f", kind: "folder", title: "Pesquisa", notes: "", children: [{ id: "t", kind: "text", title: "Ana", notes: "" }] },
];

describe("manuscript helpers", () => {
  it("numbers chapters across parts, depth first", () => {
    expect(chapterOrder(items).map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(chapterNumber(items, "c3")).toBe(3);
    expect(chapterNumber(items, "t")).toBe(0);
    expect(manuscriptWords(items)).toBe(16);
  });

  it("knows the Manuscrito and what lives inside it", () => {
    expect(manuscriptOf(items)?.id).toBe("m");
    expect(manuscriptOf(items.slice(1))).toBeNull();
    expect(inManuscript(items, "c2")).toBe(true);
    expect(inManuscript(items, "m")).toBe(true);
    expect(inManuscript(items, "t")).toBe(false);
    expect(chapterCount(items[0].children![0])).toBe(2);
    expect(isContainer("manuscript") && isContainer("folder")).toBe(true);
    expect(isContainer("chapter")).toBe(false);
  });

  it("shows an untitled chapter by its number", () => {
    expect(displayTitle(items, ch("c1", 0, "Início"))).toBe("Início");
    expect(displayTitle(items, items[0].children![0].children![1])).toBe("Capítulo 2");
    expect(displayTitle(items, { id: "t", kind: "text", title: "", notes: "" })).toBe("");
  });
});
