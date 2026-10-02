import { describe, expect, it } from "vitest";
import type { ScanItem, ScanView } from "../api/types";
import {
  allChildrenChosen, canBeChapter, chapterFolder, countChapters, coveredBy, defaultChosen, toggleChildren, toggleChosen,
} from "./scrivenerChoice";

const it_ = (key: string, kind: ScanItem["kind"], children: ScanItem[] = []): ScanItem => ({ key, kind, title: key, children });

// Manuscrito: a chapter folder with two scenes, a loose text and an image; Pesquisa: an image and a text with a child.
const view: ScanView = {
  title: "Projeto",
  items: [
    it_("draft", "draft", [it_("cap1", "folder", [it_("cena1", "text"), it_("cena2", "text")]), it_("solto", "text"), it_("capa", "image")]),
    it_("research", "research", [it_("foto", "image"), it_("ficha", "text", [it_("sub", "text")])]),
  ],
};

describe("scrivener chapter choice", () => {
  it("texts and folders can be chapters; media and the top-level roots cannot", () => {
    expect(canBeChapter(view.items[0])).toBe(false);
    expect(canBeChapter(view.items[1])).toBe(false);
    expect(canBeChapter(view.items[0].children[0])).toBe(true);
    expect(canBeChapter(view.items[0].children[1])).toBe(true);
    expect(canBeChapter(view.items[0].children[2])).toBe(false);
    expect(canBeChapter(view.items[1].children[1])).toBe(true);
  });

  it("names the chapter folder only when all its items, and nothing else, are marked", () => {
    expect(chapterFolder(view, ["cap1", "solto"])?.key).toBe("draft");
    expect(chapterFolder(view, ["cena1", "cena2"])?.key).toBe("cap1");
    expect(chapterFolder(view, ["cena1"])).toBeNull();
    expect(chapterFolder(view, ["cap1", "solto", "ficha"])).toBeNull();
    expect(chapterFolder(view, [])).toBeNull();
  });

  it("marks the manuscript's direct children by default", () => {
    expect(defaultChosen(view)).toEqual(["cap1", "solto"]);
  });

  it("toggles one item, and marking an item drops its marked descendants", () => {
    expect(toggleChosen(view, ["cap1", "solto"], "solto")).toEqual(["cap1"]);
    expect(toggleChosen(view, ["cena1", "ficha"], "cap1")).toEqual(["ficha", "cap1"]);
    // covered items and media cannot be toggled
    expect(toggleChosen(view, ["cap1"], "cena1")).toEqual(["cap1"]);
    expect(toggleChosen(view, [], "capa")).toEqual([]);
  });

  it("items inside a marked item are covered", () => {
    expect(coveredBy(view, ["cap1"], "cena1")).toBe(true);
    expect(coveredBy(view, ["cap1"], "cap1")).toBe(false);
    expect(coveredBy(view, ["cap1"], "solto")).toBe(false);
  });

  it("marks or unmarks all the direct children of a folder at once", () => {
    const scenes = toggleChildren(view, [], "cap1");
    expect(scenes).toEqual(["cena1", "cena2"]);
    expect(allChildrenChosen(view, scenes, "cap1")).toBe(true);
    expect(toggleChildren(view, scenes, "cap1")).toEqual([]);
    // a marked folder already holds its children
    expect(toggleChildren(view, ["cap1"], "cap1")).toEqual(["cap1"]);
    // the manuscript's children, media left out
    expect(toggleChildren(view, ["cena1"], "draft")).toEqual(["cap1", "solto"]);
  });

  it("counts one chapter per marked item", () => {
    expect(countChapters(view, ["cap1", "solto"])).toBe(2);
    expect(countChapters(view, ["cap1", "ficha", "sumiu"])).toBe(2);
    expect(countChapters(view, [])).toBe(0);
  });
});
