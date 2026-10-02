import { createEffect, For, on, onCleanup, Show } from "solid-js";
import { jobFraction, jobSteps, jobTitle, stepIndex, stepLine } from "../../lib/cloudJob";
import { closeNow, retryCloseBackup } from "../../store/actions/cloudClose";
import { dismissCloudJob } from "../../store/actions/cloudJob";
import { state, type CloudJob } from "../../store/state";

const bookTitle = (id: string | null) =>
  (id && (state.library.find((b) => b.id === id)?.title.trim() || (state.book?.id === id ? state.book.title.trim() : ""))) ||
  "Obra sem título";

/** Cloud with an arrow (up while sending, down while fetching), a check when done, "!" on error. */
function JobIcon(props: { job: CloudJob }) {
  return (
    <div class="cj-icon" data-phase={props.job.phase}>
      <Show
        when={props.job.phase === "working"}
        fallback={
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <circle cx="24" cy="24" r="21" />
            <Show when={props.job.phase === "done"} fallback={<path d="M24 13v14M24 33v2" />}>
              <path d="M14 25l7 7 13-15" />
            </Show>
          </svg>
        }
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path class="cj-cloud" d="M14 36h21a9 9 0 0 0 1-17.9A12 12 0 0 0 13 20a8 8 0 0 0 1 16z" />
          <g class="cj-arrow" classList={{ down: props.job.kind !== "close" }}>
            <path d="M24 33V21M19 26l5-5 5 5" />
          </g>
        </svg>
      </Show>
    </div>
  );
}

/** Big modal card for long cloud jobs: closing the app with a backup, restoring, downloading. */
export function CloudJobOverlay() {
  return <Show when={state.cloudJob}>{(job) => <JobCard job={job} />}</Show>;
}

function JobCard(props: { job: () => CloudJob }) {
  let primary: HTMLButtonElement | undefined;
  const job = () => props.job();
  const percent = () => Math.round(jobFraction(job()) * 100);

  // The overlay owns the keyboard: nothing behind it may run while a job is shown.
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Tab") {
      e.preventDefault();
      const buttons = [...document.querySelectorAll<HTMLButtonElement>(".cj-actions button")];
      const next = buttons.indexOf(document.activeElement as HTMLButtonElement) + (e.shiftKey ? -1 : 1);
      buttons[(next + buttons.length) % buttons.length]?.focus();
    } else if ((e.key === "Escape" || e.key === "Enter") && job().kind !== "close" && job().phase !== "working") {
      e.preventDefault();
      dismissCloudJob();
    } else if (e.key !== "Enter" && e.key !== " ") {
      e.preventDefault();
    }
  };
  window.addEventListener("keydown", onKey, true);
  onCleanup(() => window.removeEventListener("keydown", onKey, true));
  createEffect(on(() => job().phase, () => queueMicrotask(() => primary?.focus())));

  return (
    <>
      <div class="cj-scrim" />
      <div
        class="cj"
        data-phase={job().phase}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cj-title"
        aria-describedby="cj-detail"
        aria-busy={job().phase === "working"}
      >
        <JobIcon job={job()} />
        <h2 id="cj-title" class="cj-title">
          {jobTitle(job())}
        </h2>
        <div id="cj-detail" class="cj-detail">
          <Show when={job().phase === "working"} fallback={<p class="cj-msg">{job().message}</p>}>
            <Show when={job().kind !== "close" || job().book}>
              <p class="cj-book">
                <Show when={job().book}>{(b) => <span class="cj-count">{"Obra " + b().n + " de " + b().of + " · "}</span>}</Show>
                {"«" + bookTitle(job().bookId) + "»"}
              </p>
            </Show>
            <p class="cj-step" aria-live="polite">
              {stepLine(job())}
            </p>
            <div class="cj-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent()}>
              <div class="cj-fill" style={{ width: Math.max(4, percent()) + "%" }} />
            </div>
          </Show>
          <Show when={jobSteps(job().kind).length}>
            <ol class="cj-steps">
              <For each={jobSteps(job().kind)}>
                {(s, i) => {
                  const at = () => (job().phase === "done" ? Infinity : stepIndex(job()));
                  const failed = () => job().phase === "error" && i() === at();
                  return (
                    <li classList={{ ok: i() < at(), now: i() === at() && !failed(), bad: failed() }}>
                      <span class="cj-dot" aria-hidden="true" />
                      {s.label}
                    </li>
                  );
                }}
              </For>
            </ol>
          </Show>
          <Show when={job().kind === "close" && job().phase === "error"}>
            <p class="cj-safe">Tudo continua salvo neste computador. Só a cópia na nuvem ficou para depois.</p>
          </Show>
        </div>
        <div class="cj-actions">
          <Show when={job().kind === "close"}>
            <Show
              when={job().phase === "error"}
              fallback={
                <Show when={job().phase === "working"}>
                  <button type="button" class="cj-btn" ref={primary} onClick={closeNow}>
                    Fechar sem esperar
                  </button>
                </Show>
              }
            >
              <button type="button" class="cj-btn" onClick={closeNow}>
                Fechar mesmo assim
              </button>
              <button type="button" class="cj-btn primary" ref={primary} onClick={() => void retryCloseBackup()}>
                Tentar de novo
              </button>
            </Show>
          </Show>
          <Show when={job().kind !== "close" && job().phase !== "working"}>
            <button type="button" class="cj-btn primary" ref={primary} onClick={dismissCloudJob}>
              {job().phase === "done" ? "Continuar" : "Fechar"}
            </button>
          </Show>
        </div>
      </div>
    </>
  );
}
