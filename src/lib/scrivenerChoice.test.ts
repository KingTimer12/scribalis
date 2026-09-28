import { describe, expect, it } from "vitest";
import type { ScanItem, ScanView } from "../api/types";
import { canBeChapters, countChapters, coveredBy, defaultChosen, toggleChosen } from "./scrivenerChoice";

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
  it("only folders and texts with children can become chapters", () => {
    expect(canBeChapters(view.items[0])).toBe(true);
    expect(canBeChapters(view.items[1])).toBe(true);
    expect(canBeChapters(view.items[0].children[0])).toBe(true);
    expect(canBeChapters(view.items[0].children[1])).toBe(false);
    expect(canBeChapters(view.items[1].children[0])).toBe(false);
    expect(canBeChapters(view.items[1].children[1])).toBe(true);
  });

  it("marks the manuscript by default", () => {
    expect(defaultChosen(view)).toEqual(["draft"]);
  });

  it("toggles, and marking a folder drops its marked descendants", () => {
    expect(toggleChosen(view, ["draft"], "draft")).toEqual([]);
    expect(toggleChosen(view, ["cap1", "ficha"], "draft")).toEqual(["ficha", "draft"]);
    // a covered item cannot be toggled on its own
    expect(toggleChosen(view, ["draft"], "cap1")).toEqual(["draft"]);
  });

  it("items under a marked folder are covered", () => {
    expect(coveredBy(view, ["draft"], "cena1")).toBe(true);
    expect(coveredBy(view, ["draft"], "draft")).toBe(false);
    expect(coveredBy(view, ["draft"], "ficha")).toBe(false);
  });

  it("counts the direct non-media children of the marked folders", () => {
    expect(countChapters(view, ["draft"])).toBe(2);
    expect(countChapters(view, ["draft", "research"])).toBe(3);
    expect(countChapters(view, [])).toBe(0);
  });
});
