import type { ImportResult, ScanView } from "../types";

const DESKTOP_ONLY = "Importar do Scrivener só funciona no app desktop";

// No file system in the browser: mirrors the desktop-only import in `commands::scrivener`.
export const scrivener = {
  scrivener_pick: (): string | null => {
    throw DESKTOP_ONLY;
  },
  scrivener_scan: (_: { path: string }): ScanView => {
    throw DESKTOP_ONLY;
  },
  scrivener_import: (_: { path: string; chapterItems: string[]; target: unknown }): ImportResult => {
    throw DESKTOP_ONLY;
  },
};
