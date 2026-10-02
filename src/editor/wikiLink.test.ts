import { describe, expect, it, vi } from "vitest";
import type { AreaNode, DocJSON } from "../api/types";
import { docText } from "../lib/doc";
import { splitWikiQuery, wikiMatches } from "../lib/wikiLinks";
import { createWriterEditor } from "./createEditor";
import type { WikiLinkTarget } from "./wikiLink";
import { findWikiQuery } from "./wikiLinkSuggest";

function editor(lookup = (_id: string) => undefined as WikiLinkTarget | undefined, open = vi.fn()) {
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
    wikiLinks: { lookup, open, onQuery: () => {}, onKey: () => false },
  });
}

const para = (content: NonNullable<Extract<DocJSON["content"][number], { type: "paragraph" }>["content"]>): DocJSON => ({
  type: "doc",
  content: [{ type: "paragraph", content }],
});

const doc = para([
  { type: "text", text: "Ver " },
  { type: "wikiLink", attrs: { id: "c3", label: "" } },
  { type: "text", text: " e " },
  { type: "wikiLink", attrs: { id: "c3", label: "aquela noite" } },
]);

describe("wiki links", () => {
  it("survive the editor; no alias follows the live title, an alias stays", () => {
    const open = vi.fn();
    const ed = editor((id) => (id === "c3" ? { title: "Capítulo 3", kind: "chapter" } : undefined), open);
    ed.commands.setContent(doc);
    const p = doc.content[0];
    expect(ed.getJSON().content?.[0].content).toEqual(p.type === "paragraph" ? p.content : null);
    const links = [...ed.view.dom.querySelectorAll<HTMLElement>(".wikilink")];
    expect(links.map((l) => l.textContent)).toEqual(["Capítulo 3", "aquela noite"]);
    expect(links[0].dataset.kind).toBe("chapter");
    links[1].click();
    expect(open).toHaveBeenCalledWith("c3");
    ed.destroy();
  });

  it("a link to a deleted node is struck through and does not open", () => {
    const open = vi.fn();
    const ed = editor(undefined, open);
    ed.commands.setContent(doc);
    const links = [...ed.view.dom.querySelectorAll<HTMLElement>(".wikilink")];
    expect(links.map((l) => l.textContent)).toEqual(["?", "aquela noite"]);
    expect(links.every((l) => l.classList.contains("gone"))).toBe(true);
    links[0].click();
    expect(open).not.toHaveBeenCalled();
    ed.destroy();
  });

  it("plain text reads a link as its alias", () => {
    expect(docText(doc)).toBe("Ver  e aquela noite");
  });

  it("[[ opens a query, with the alias after |", () => {
    const ed = editor();
    ed.commands.setContent(para([{ type: "text", text: "Oi [[cap 3|aquela noite" }]));
    ed.commands.focus("end");
    const q = findWikiQuery(ed.view)!;
    expect(q).toMatchObject({ query: "cap 3|aquela noite", from: 4 });
    expect(splitWikiQuery(q.query)).toEqual({ search: "cap 3", alias: "aquela noite" });
    ed.commands.setContent(para([{ type: "text", text: "Oi [cap" }]));
    ed.commands.focus("end");
    expect(findWikiQuery(ed.view)).toBeNull();
    ed.destroy();
  });

  it("the menu offers linkable nodes by title, accents ignored, starts first", () => {
    const n = (id: string, kind: AreaNode["kind"], title: string, children?: AreaNode[]): AreaNode => ({ id, kind, title, notes: "", children });
    const tree = [
      n("m", "manuscript", "Manuscrito", [n("c1", "chapter", "O capítulo"), n("c2", "chapter", "Capítulo 2")]),
      n("f", "folder", "Pesquisa", [n("i", "image", "Capa"), n("t", "text", "Notas")]),
    ];
    expect(wikiMatches(tree, "capitulo").map((x) => x.id)).toEqual(["c2", "c1"]);
    expect(wikiMatches(tree, "cap").map((x) => x.id)).toEqual(["c2", "c1"]);
    expect(wikiMatches(tree, "", "c1").map((x) => x.id)).toEqual(["m", "c2", "f", "t"]);
  });
});
