import { getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "../../api/cloud";
import type { CloseReport } from "../../api/types";
import { setState, state } from "../state";
import { failCloudJob, finishCloudJob, startCloudJob } from "./cloudJob";

/** A close that needs no upload ends before the overlay would flash on screen. */
const SHOW_AFTER_MS = 250;
/** How long "Tudo guardado na nuvem" stays before the window goes. */
const DONE_HOLD_MS = 1100;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const bookTitle = (id: string) => state.library.find((b) => b.id === id)?.title.trim() || "Obra sem título";

/** Error card text: which books did not reach the server, and why. */
export function closeFailure(report: CloseReport): string | null {
  const lines = report.failed.map((f) => "«" + bookTitle(f.bookId) + "»: " + f.message);
  if (report.timedOut) lines.push("A nuvem demorou demais para responder.");
  return lines.length ? lines.join("\n") : null;
}

/**
 * Backs up every changed book before the window closes. Resolves true when the window may close;
 * false keeps it open on the error card, whose buttons retry or close anyway.
 */
export async function backupBeforeClose(manual = false): Promise<boolean> {
  if (!state.cloud?.connected) return true;
  const show = manual ? undefined : setTimeout(() => startCloudJob("close", null), SHOW_AFTER_MS);
  if (manual) startCloudJob("close", null);
  let report: CloseReport;
  try {
    report = await api.cloudBackupOnClose(manual);
  } catch {
    clearTimeout(show);
    setState("cloudJob", null);
    return true;
  }
  clearTimeout(show);
  const failure = closeFailure(report);
  if (failure) {
    if (!state.cloudJob) startCloudJob("close", null);
    failCloudJob(failure);
    return false;
  }
  if (report.sent > 0 && state.cloudJob) {
    finishCloudJob(report.sent === 1 ? "1 obra enviada." : report.sent + " obras enviadas.");
    await wait(DONE_HOLD_MS);
  }
  return true;
}

/** Closes the window without waiting for the cloud (everything is already saved on disk). */
export function closeNow() {
  void getCurrentWindow().destroy();
}

/** "Tentar de novo" on the close error card. */
export async function retryCloseBackup() {
  if (await backupBeforeClose(true)) closeNow();
}
