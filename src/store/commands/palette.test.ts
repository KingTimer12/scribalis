import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { BookSummary } from "../../api/types";
import { SHORTCUTS } from "../../data/shortcuts";
import { openBook } from "../actions/library";
import { createNode } from "../actions/workspace";
import { setState, state } from "../state";
import { paletteItems } from "./palette";

const labels = () => paletteItems().map((c) => c.label);
const run = (label: string) => paletteItems().find((c) => c.label === label)!.act();

describe("palette in a book", () => {
  it("has no tab or index commands and offers the tree ones", async () => {
    const created = await mockInvoke<BookSummary>("library_create", { title: "Paleta" });
    await openBook(created.id);
    setState({ q: "" });
    for (const gone of ["Capítulos", "Área de trabalho", "Índice de capítulos", "Enviar capítulo para a área de trabalho"]) {
      expect(labels()).not.toContain(gone);
    }
    expect(labels()).toEqual(expect.arrayContaining(["Novo capítulo", "Novo texto", "Nova pasta", "Recolher barra lateral", "Mover para fora do Manuscrito"]));
    setState("areaSel", null);
    await createNode("text");
    expect(labels()).toContain("Mover para o Manuscrito");
  });

  it("Novo texto from inside the Manuscrito lands outside it, Novo capítulo from outside lands inside", async () => {
    const created = await mockInvoke<BookSummary>("library_create", { title: "Paleta 2" });
    await openBook(created.id);
    setState({ q: "", areaSel: state.area[0].children![0].id });
    run("Novo texto");
    await new Promise((r) => setTimeout(r, 10));
    expect(state.area[state.area.length - 1].kind).toBe("text");
    expect(state.toast).toBe("");
    run("Novo capítulo");
    await new Promise((r) => setTimeout(r, 10));
    expect(state.area[0].children!.length).toBe(2);
    expect(state.toast).not.toBe("Só capítulos e pastas entram no Manuscrito");
  });

  it("help lists the tree shortcuts and no tab shortcut", () => {
    const help = SHORTCUTS.map((s) => s.label);
    expect(help).toContain("Mostrar / recolher a árvore");
    expect(help.some((l) => l.includes("Área de trabalho"))).toBe(false);
    expect(help.some((l) => l.includes("Índice"))).toBe(false);
  });
});
