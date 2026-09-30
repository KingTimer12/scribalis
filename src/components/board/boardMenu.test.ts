import { describe, expect, it } from "vitest";
import { backgroundMenu, cardMenu } from "./boardMenu";

describe("board menus", () => {
  it("has the card and background items", () => {
    expect(cardMenu("a").map((i) => i.label)).toEqual(["Novo cartão depois", "Duplicar", "Excluir"]);
    expect(cardMenu("a")[2].danger).toBe(true);
    expect(backgroundMenu().map((i) => i.label)).toEqual(["Novo cartão"]);
  });
});
