import type { Book, Prefs } from "./types";

/**
 * Persistência. Hoje usa localStorage; trocar por arquivos/SQLite (Tauri)
 * ou backend exige mexer só aqui.
 */
const STORE_KEY = "scribalis-v1";

export interface SavedData {
  books: Book[];
  prefs: Partial<Prefs>;
}

export function loadData(): SavedData | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.books)) return null;
    return { books: data.books, prefs: data.prefs || {} };
  } catch {
    return null;
  }
}

export function saveData(data: SavedData) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* armazenamento indisponível: segue em memória */
  }
}
