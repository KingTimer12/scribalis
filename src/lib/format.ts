import { DAY, HOUR } from "./constants";
import type { Book } from "./types";

export function uid() {
  return "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Contagem de palavras. */
export function wc(s: string | undefined) {
  const m = (s || "").match(/\S+/g);
  return m ? m.length : 0;
}

export function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

export function pad(n: number) {
  return n < 10 ? "0" + n : "" + n;
}

/** Normaliza para busca: sem acento, minúsculo. */
export function norm(s: string | undefined) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function plural(n: number, one: string, many: string) {
  return fmt(n) + " " + (n === 1 ? one : many);
}

export function bookWords(b: Book) {
  return b.chapters.reduce((a, c) => a + wc(c.body), 0);
}

export function allWords(books: Book[]) {
  return books.reduce((a, b) => a + bookWords(b), 0);
}

export function ago(t: number) {
  const d = Date.now() - (t || 0);
  if (d < 60000) return "agora";
  if (d < HOUR) return "há " + Math.floor(d / 60000) + " min";
  if (d < DAY) return "há " + Math.floor(d / HOUR) + " h";
  if (d < 2 * DAY) return "ontem";
  if (d < 30 * DAY) return "há " + Math.floor(d / DAY) + " dias";
  return new Date(t).toLocaleDateString("pt-BR");
}
