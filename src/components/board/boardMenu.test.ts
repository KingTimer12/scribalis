import { describe, expect, it } from "vitest";
import type { AreaNode } from "../../api/types";
import { newBook } from "../../test/newBook";
import { backgroundMenu, cardKindLabel, cardMenu } from "./boardMenu";

const folder: AreaNode = { id: "f", kind: "folder", title: "Pasta", notes: "" };
const text: AreaNode = { id: "t", kind: "text", title: "Ana", notes: "", file: "t.md" };
const image: AreaNode = { id: "i", kind: "image", title: "Mapa", notes: "", file: "arquivos/i.png" };

describe("board menus", () => {
  it("documents can take subdocuments; other cards cannot", async () => {
    await newBook();
    const parent = { ...folder, children: [text, image] };
    expect(cardMenu(parent, text).map((i) => i.label)).toEqual(["Abrir", "Novo documento depois", "Novo subdocumento", "Excluir"]);
    expect(cardMenu(parent, image).map((i) => i.label)).toEqual(["Abrir", "Novo documento depois", "Excluir"]);
    const del = cardMenu(parent, text)[3];
    expect([del.danger, del.hint]).toEqual([true, "Del"]);
    expect(backgroundMenu(parent).map((i) => i.label)).toEqual(["Novo documento"]);
  });

  it("names the card's kind", () => {
    expect([folder, text, image].map(cardKindLabel)).toEqual(["Pasta", "Documento", "Imagem"]);
  });
});
