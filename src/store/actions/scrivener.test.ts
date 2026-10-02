import { describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../../api/mock";
import * as api from "../../api/scrivener";
import type { ScanView } from "../../api/types";
import { newBook } from "../../test/newBook";
import { setState, state } from "../state";
import { confirmScrivenerImport, importSummary } from "./scrivener";

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

describe("confirmScrivenerImport", () => {
  it("refreshes the tree when importing into the open book", async () => {
    const book = await newBook();
    // The import (Rust) adds items behind the store's back.
    const spy = vi.spyOn(api, "importScrivener").mockImplementation(async () => {
      await mockInvoke("workspace_create", { bookId: book.id, parent: null, index: 9, kind: "folder", title: "Do Scrivener" });
      return { bookId: book.id, chapters: 0, items: 1, warnings: 0 };
    });
    setState("scrivener", { path: "x.scriv", view: { items: [] } as unknown as ScanView, chosen: [], target: { type: "book", id: book.id }, busy: false });
    await confirmScrivenerImport();
    expect(state.area.map((n) => n.title)).toContain("Do Scrivener");
    spy.mockRestore();
  });
});
