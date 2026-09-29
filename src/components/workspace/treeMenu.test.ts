import { describe, expect, it } from "vitest";
import type { AreaNode } from "../../api/types";
import { findNode } from "../../lib/tree";
import { setState } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";
import { newMenu, treeMenu } from "./treeMenu";

const n = (id: string, kind: AreaNode["kind"], children?: AreaNode[], extra: Partial<AreaNode> = {}): AreaNode =>
  ({ id, kind, title: id, notes: "", children, ...extra });
const area: AreaNode[] = [
  n("m", "manuscript", [n("p", "folder", [n("c1", "chapter", undefined, { status: "revisao" })]), n("c2", "chapter")]),
  n("f", "folder", [n("t", "text"), n("i", "image"), n("a", "file")]),
];
const labels = (items: MenuItem[]) => items.map((i) => i.label);
const menuOf = (id: string) => treeMenu(findNode(area, id));

describe("tree menus", () => {
  it("offer per node type what the spec lists", () => {
    setState({ area, areaSel: null });
    expect(labels(menuOf("m"))).toEqual(["Novo capítulo", "Nova pasta"]);
    expect(labels(menuOf("p"))).toEqual(["Novo capítulo", "Nova pasta", "Renomear", "Excluir"]);
    expect(labels(menuOf("c2"))).toEqual([
      "Renomear", "Status: Rascunho", "Status: Revisão", "Status: Pronto", "Compartilhar…",
      "Copiar para publicar", "Mover para fora do Manuscrito", "Excluir",
    ]);
    expect(labels(menuOf("f"))).toEqual(["Novo texto", "Nova pasta", "Adicionar imagem ou arquivo…", "Renomear", "Compartilhar…", "Excluir"]);
    expect(labels(menuOf("t"))).toEqual(["Abrir", "Renomear", "Compartilhar…", "Mover para o Manuscrito", "Excluir"]);
    expect(labels(menuOf("i"))).toEqual(["Abrir", "Renomear", "Excluir"]);
    expect(labels(menuOf("a"))).toEqual(["Abrir", "Abrir no app padrão", "Renomear", "Excluir"]);
    expect(labels(treeMenu(null))).toEqual(["Novo texto", "Nova pasta", "Adicionar imagem ou arquivo…"]);
  });

  it("marks the chapter's current status", () => {
    setState({ area });
    const status = menuOf("c1").filter((i) => i.label.startsWith("Status"));
    expect(status.map((i) => !!i.disabled)).toEqual([false, true, false]);
  });

  it("+ Novo offers Capítulo only inside the Manuscrito and Texto only outside", () => {
    setState({ area, areaSel: "c1" });
    expect(labels(newMenu())).toEqual(["Capítulo", "Pasta"]);
    setState("areaSel", "m");
    expect(labels(newMenu())).toEqual(["Capítulo", "Pasta"]);
    setState("areaSel", "t");
    expect(labels(newMenu())).toEqual(["Texto", "Pasta", "Imagem ou arquivo…"]);
    setState("areaSel", null);
    expect(labels(newMenu())).toEqual(["Texto", "Pasta", "Imagem ou arquivo…"]);
  });
});
