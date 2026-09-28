import { describe, expect, it } from "vitest";
import { importSummary } from "./scrivener";

describe("importSummary", () => {
  it("uses singular and plural forms", () => {
    expect(importSummary({ bookId: "b", chapters: 1, items: 1, warnings: 0 })).toBe("Importado: 1 capítulo, 1 item");
    expect(importSummary({ bookId: "b", chapters: 12, items: 0, warnings: 0 })).toBe("Importado: 12 capítulos, 0 itens");
  });

  it("mentions items that could not be read", () => {
    expect(importSummary({ bookId: "b", chapters: 2, items: 3, warnings: 1 })).toBe("Importado: 2 capítulos, 3 itens · 1 item não pôde ser lido");
    expect(importSummary({ bookId: "b", chapters: 2, items: 3, warnings: 4 })).toBe("Importado: 2 capítulos, 3 itens · 4 itens não puderam ser lidos");
  });
});
