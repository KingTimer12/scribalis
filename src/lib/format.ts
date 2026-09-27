import { DAY, HOUR } from "./constants";

/** Word count. */
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

/** Normalizes for search: no accents, lowercase. */
export function norm(s: string | undefined) {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function plural(n: number, one: string, many: string) {
  return fmt(n) + " " + (n === 1 ? one : many);
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
