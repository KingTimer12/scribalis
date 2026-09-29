import { flashError } from "./ui";

/**
 * Runs an async store action and shows a failure as a toast. `recover` sees the error first
 * and returns true when it handled it (e.g. a stale id that only needs the tree reloaded).
 */
export async function run(fn: () => Promise<void>, recover?: (e: unknown) => Promise<boolean>) {
  try {
    await fn();
  } catch (e) {
    if (recover && (await recover(e))) return;
    flashError(e);
  }
}
