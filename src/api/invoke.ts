import { invoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./mock";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Calls a Rust command, or the in-memory mock when running outside Tauri. */
export function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return isTauri ? invoke<T>(cmd, args) : mockInvoke<T>(cmd, args);
}
