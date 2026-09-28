import { call } from "./invoke";
import type { ImportResult, ImportTarget, ScanView } from "./types";

/** Native picker for a `.scriv` project; null when cancelled. */
export const pickScrivener = () => call<string | null>("scrivener_pick", {});

/** Reads the project's binder (titles and kinds only). */
export const scanScrivener = (path: string) => call<ScanView>("scrivener_scan", { path });

/** Imports the project: each item of `chapterItems` becomes one chapter, the rest goes to the workspace. */
export const importScrivener = (path: string, chapterItems: string[], target: ImportTarget) =>
  call<ImportResult>("scrivener_import", { path, chapterItems, target });
