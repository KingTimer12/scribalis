import type { CloudJob } from "../store/state";

type Step = NonNullable<CloudJob["step"]>;

/** Checklist of a restore or download; closing has none (it walks the books instead). */
export function jobSteps(kind: CloudJob["kind"]): { step: Step; label: string }[] {
  if (kind === "restore")
    return [
      { step: "downloading", label: "Baixar a cópia" },
      { step: "saving", label: "Guardar a versão atual" },
      { step: "swapping", label: "Trocar os arquivos" },
      { step: "reopening", label: "Abrir a obra" },
    ];
  if (kind === "download")
    return [
      { step: "downloading", label: "Baixar os arquivos" },
      { step: "swapping", label: "Pôr na biblioteca" },
    ];
  return [];
}

/** Index of the job's step in its checklist; uploading the current state counts as "saving". */
export function stepIndex(job: CloudJob): number {
  const step = job.step === "sending" && job.kind === "restore" ? "saving" : job.step;
  return Math.max(0, jobSteps(job.kind).findIndex((s) => s.step === step));
}

/** Share of the step's files done; steps without a count sit halfway. */
const stepShare = (job: CloudJob) => (job.total > 0 ? Math.min(1, job.done / job.total) : 0.5);

/** Overall progress between 0 and 1. */
export function jobFraction(job: CloudJob): number {
  if (job.phase === "done") return 1;
  if (job.kind === "close") {
    if (!job.book) return 0;
    const share = job.step === "sending" ? stepShare(job) : 0;
    return (job.book.n - 1 + share) / job.book.of;
  }
  const steps = jobSteps(job.kind).length;
  return (stepIndex(job) + stepShare(job)) / steps;
}

export function jobTitle(job: CloudJob): string {
  const titles = {
    close: ["Guardando na nuvem", "Tudo guardado na nuvem", "A nuvem não recebeu tudo"],
    restore: ["Restaurando da nuvem", "Cópia restaurada!", "Não deu para restaurar"],
    download: ["Baixando da nuvem", "Obra baixada!", "Não deu para baixar"],
  } as const;
  return titles[job.kind][job.phase === "working" ? 0 : job.phase === "done" ? 1 : 2];
}

/** What is happening right now, for the working card. */
export function stepLine(job: CloudJob): string {
  const count = job.total > 0 ? " · " + job.done + " de " + job.total : "";
  switch (job.step) {
    case "checking":
      return "Conferindo as mudanças";
    case "sending":
      return (job.kind === "restore" ? "Guardando a versão atual" : "Enviando arquivos") + count;
    case "downloading":
      return "Baixando arquivos" + count;
    case "saving":
      return "Guardando a versão atual";
    case "swapping":
      return job.kind === "download" ? "Pondo na biblioteca" : "Trocando os arquivos";
    case "reopening":
      return "Abrindo a obra";
    default:
      return job.kind === "close" ? "Preparando" : "Falando com a nuvem";
  }
}
