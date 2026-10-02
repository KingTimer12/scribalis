import type { CloudProgress } from "../../api/types";
import { setState, state, type CloudJob } from "../state";

/** Opens the overlay on a new job. */
export function startCloudJob(kind: CloudJob["kind"], bookId: string | null) {
  setState("cloudJob", { kind, phase: "working", bookId, step: null, done: 0, total: 0, book: null, message: "" });
}

/** A step the webview runs itself (reopening the restored book). */
export function setCloudJobStep(step: CloudJob["step"]) {
  if (state.cloudJob?.phase === "working") setState("cloudJob", { step, done: 0, total: 0 });
}

/** `cloud://progress` from Rust; only moves the working job it belongs to. */
export function applyCloudProgress(p: CloudProgress) {
  const job = state.cloudJob;
  if (job?.phase !== "working") return;
  if (job.kind === "close") {
    if (p.step === "checking") {
      setState("cloudJob", { bookId: p.bookId, book: { n: p.done + 1, of: p.total }, step: "checking", done: 0, total: 0 });
      return;
    }
    if (p.bookId !== job.bookId) return;
  } else if (p.bookId !== job.bookId) {
    return;
  }
  setState("cloudJob", { step: p.step, done: p.done, total: p.total });
}

export function finishCloudJob(message: string) {
  if (state.cloudJob) setState("cloudJob", { phase: "done", message });
}

export function failCloudJob(message: string) {
  if (state.cloudJob) setState("cloudJob", { phase: "error", message });
}

/** Closes the overlay; a job still working stays (its result has nowhere else to show). */
export function dismissCloudJob() {
  if (state.cloudJob?.phase !== "working") setState("cloudJob", null);
}

export const errorMessage = (e: unknown) => (typeof e === "string" ? e : "Algo deu errado.");
