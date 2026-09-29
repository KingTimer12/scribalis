import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { AreaNode } from "../../api/types";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { findNode } from "../../lib/tree";
import { newBook } from "../../test/newBook";
import { flushAll } from "../saving";
import { state } from "../state";
import { flushSynopsis, scheduleSynopsis } from "./synopsis";

const saved = async (bookId: string, id: string) =>
  findNode(await mockInvoke<AreaNode[]>("workspace_tree", { bookId }), id)?.synopsis;

describe("synopsis", () => {
  it("shows at once and saves on flush", async () => {
    const book = await newBook();
    const m = state.area[0].id;
    scheduleSynopsis(m, "A história toda");
    expect(findNode(state.area, m)?.synopsis).toBe("A história toda");
    expect(await saved(book.id, m)).toBeUndefined();
    await flushSynopsis();
    expect(await saved(book.id, m)).toBe("A história toda");
  });

  it("flushAll saves a pending synopsis to its own book, even after a book switch", async () => {
    const first = await newBook();
    const m = state.area[0].id;
    scheduleSynopsis(m, "nao perder");
    await newBook();
    await flushAll();
    expect(await saved(first.id, m)).toBe("nao perder");
  });

  it("typing into another node's synopsis lands the previous one first", async () => {
    const book = await newBook();
    const m = state.area[0].id;
    const chapter = state.area[0].children![0].id;
    scheduleSynopsis(m, "do manuscrito");
    scheduleSynopsis(chapter, "do capítulo");
    await flushSynopsis();
    expect(await saved(book.id, m)).toBe("do manuscrito");
    expect(await saved(book.id, chapter)).toBe("do capítulo");
  });

  it("never shows more than SYNOPSIS_MAX characters", async () => {
    await newBook();
    const m = state.area[0].id;
    scheduleSynopsis(m, "x".repeat(SYNOPSIS_MAX + 10));
    expect(findNode(state.area, m)?.synopsis?.length).toBe(SYNOPSIS_MAX);
    await flushSynopsis();
  });
});
