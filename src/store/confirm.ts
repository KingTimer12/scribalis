import { createSignal } from "solid-js";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  /** Destructive action: the confirm button is drawn in the warning color. */
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

const [pending, setPending] = createSignal<Pending | null>(null);

/** The dialog being shown, if any (read by `ConfirmDialog`). */
export const pendingConfirm = pending;

/** Asks the user; resolves true on confirm, false on cancel. Only one dialog exists: a new ask cancels the old one. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  pending()?.resolve(false);
  return new Promise<boolean>((resolve) => setPending({ ...options, resolve }));
}

/** Closes the dialog with the user's answer. */
export function answerConfirm(ok: boolean) {
  const p = pending();
  if (!p) return;
  setPending(null);
  p.resolve(ok);
}
