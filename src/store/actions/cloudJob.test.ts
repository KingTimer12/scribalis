import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api/cloud";
import { listLibrary } from "../../api/library";
import { cloudDb } from "../../api/mock/db";
import { jobFraction, stepLine } from "../../lib/cloudJob";
import { setState, state } from "../state";
import { downloadBook, restoreSnapshot } from "./cloud";
import { backupBeforeClose, closeFailure } from "./cloudClose";
import { applyCloudProgress, dismissCloudJob, startCloudJob } from "./cloudJob";
import { openBook } from "./library";

const snapshot = { id: "snp_1", createdAt: Date.UTC(2026, 9, 2, 12), note: null, fileCount: 3, totalSize: 10 };

describe("cloud job overlay", () => {
  beforeEach(() => {
    cloudDb.connected = false;
    setState({ cloud: null, cloudJob: null, toast: "" });
  });
  afterEach(() => vi.restoreAllMocks());

  it("progress events move the job of their book only", () => {
    startCloudJob("restore", "b1");
    applyCloudProgress({ bookId: "b2", step: "downloading", done: 1, total: 4 });
    expect(state.cloudJob?.step).toBeNull();
    applyCloudProgress({ bookId: "b1", step: "downloading", done: 1, total: 4 });
    expect(stepLine(state.cloudJob!)).toBe("Baixando arquivos · 1 de 4");
    expect(jobFraction(state.cloudJob!)).toBeCloseTo(1 / 16);
    applyCloudProgress({ bookId: "b1", step: "sending", done: 0, total: 2 });
    expect(stepLine(state.cloudJob!)).toBe("Guardando a versão atual · 0 de 2");
  });

  it("closing walks the books one by one", () => {
    startCloudJob("close", null);
    applyCloudProgress({ bookId: "b2", step: "checking", done: 1, total: 2 });
    expect(state.cloudJob?.book).toEqual({ n: 2, of: 2 });
    applyCloudProgress({ bookId: "b2", step: "sending", done: 1, total: 2 });
    expect(jobFraction(state.cloudJob!)).toBeCloseTo(0.75);
  });

  it("a restore ends on the done card with the copy's time, and Continuar clears it", async () => {
    const { books } = await listLibrary();
    await openBook(books[0].id);
    await restoreSnapshot(snapshot);
    expect(state.cloudJob?.phase).toBe("done");
    expect(state.cloudJob?.message).toContain("A versão de antes ficou guardada");
    dismissCloudJob();
    expect(state.cloudJob).toBeNull();
  });

  it("a failed download shows the reason on the error card", async () => {
    vi.spyOn(api, "cloudDownload").mockRejectedValueOnce("Esta obra não tem backup na nuvem.");
    await downloadBook("b9");
    expect(state.cloudJob).toMatchObject({ kind: "download", phase: "error", message: "Esta obra não tem backup na nuvem." });
  });

  it("closing without the cloud closes at once, with no overlay", async () => {
    const spy = vi.spyOn(api, "cloudBackupOnClose");
    expect(await backupBeforeClose()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(state.cloudJob).toBeNull();
  });

  it("a failed close backup keeps the window open on the error card", async () => {
    setState("cloud", { apiUrl: "", defaultApiUrl: "", connected: true });
    vi.spyOn(api, "cloudBackupOnClose").mockResolvedValueOnce({
      sent: 0,
      failed: [{ bookId: "nope", message: "Sem conexão com a nuvem." }],
      timedOut: false,
    });
    expect(await backupBeforeClose()).toBe(false);
    expect(state.cloudJob).toMatchObject({ kind: "close", phase: "error" });
    expect(state.cloudJob?.message).toBe("«Obra sem título»: Sem conexão com a nuvem.");
  });

  it("a timeout is part of the failure text", () => {
    expect(closeFailure({ sent: 1, failed: [], timedOut: true })).toBe("A nuvem demorou demais para responder.");
    expect(closeFailure({ sent: 1, failed: [], timedOut: false })).toBeNull();
  });
});
