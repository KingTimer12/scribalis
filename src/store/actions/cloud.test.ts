import { chapterOrder } from "../../lib/manuscript";
import { findNode } from "../../lib/tree";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudDb } from "../../api/mock/db";
import { listLibrary } from "../../api/library";
import { setState, state } from "../state";
import { activateCloud, backupNow, createShare, fetchComments, loadBookCloud, setBookBackup } from "./cloud";
import { setBookEncrypted } from "./cloudCrypto";
import { answerConfirm, pendingConfirm } from "../confirm";
import { openBook } from "./library";

async function openFirstBook() {
  const { books } = await listLibrary();
  await openBook(books[0].id);
  return books[0].id;
}

describe("cloud actions", () => {
  beforeEach(() => {
    cloudDb.connected = false;
    cloudDb.books = {};
    cloudDb.shares = [];
    cloudDb.comments = {};
    setState({ cloud: null, cloudBook: null, toast: "" });
  });

  it("activating the vault marks it connected", async () => {
    await activateCloud("Casa");
    expect(state.cloud?.connected).toBe(true);
  });

  it("enabling a book backs it up and lights the cover badge", async () => {
    await activateCloud("Casa");
    const id = await openFirstBook();
    await setBookBackup(true);
    expect(state.cloudBook?.enabled).toBe(true);
    expect(state.cloudBook?.lastBackupAt).not.toBeNull();
    const { books } = await listLibrary();
    expect(books.find((b) => b.id === id)?.cloud).toBe(true);
    expect(books.filter((b) => b.cloud)).toHaveLength(1);
  });

  it("manual backup on a disabled book shows the reason", async () => {
    await activateCloud("Casa");
    await openFirstBook();
    await backupNow();
    expect(state.toast).toBe("Ative o backup desta obra primeiro.");
  });

  it("an encrypted book refuses links; once left open, creating a link copies its URL", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await activateCloud("Casa");
    const id = await openFirstBook();
    const input = { bookId: id, kind: "chapter" as const, target: chapterOrder(state.area)[0].id, freeze: false, includeNotes: false, allowComments: true, expiresInDays: null };
    await createShare(input);
    expect(writeText).not.toHaveBeenCalled();
    expect(state.toast).toContain("criptografada");
    const opened = setBookEncrypted(false);
    expect(pendingConfirm()?.title).toBe("Deixar esta obra aberta?");
    answerConfirm(true);
    expect(await opened).toBe(true);
    expect(state.cloudBook?.encrypted).toBe(false);
    await createShare(input);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/scribalis/s/"));
    expect(state.toast).toBe("Link copiado");
    vi.unstubAllGlobals();
  });

  it("fetched comments land in the chapter notes of the open book", async () => {
    await activateCloud("Casa");
    const id = await openFirstBook();
    await loadBookCloud(id);
    const chapterId = state.areaOpen!;
    cloudDb.comments[id] = [[chapterId, "achei confuso"]];
    await fetchComments(false);
    expect(findNode(state.area, chapterId)!.notes).toContain("achei confuso");
    expect(state.toast).toBe("1 comentário adicionado às notas");
  });

  it("books start encrypted, and cancelling the question keeps it that way", async () => {
    await activateCloud("Casa");
    const id = await openFirstBook();
    await loadBookCloud(id);
    expect(state.cloudBook?.encrypted).toBe(true);
    const asked = setBookEncrypted(false);
    answerConfirm(false);
    expect(await asked).toBe(false);
    expect(state.cloudBook?.encrypted).toBe(true);
  });
});
