import type { Sheet, SheetField, SheetKind, Sheets } from "../api/types";
import { norm } from "./format";

/** Sheets of `kind` whose name or any filled-in text matches `q` (accents and case ignored). */
export function filterSheets(sheets: Sheets, kind: SheetKind, q: string): Sheet[] {
  const want = norm(q.trim());
  return sheets.sheets.filter(
    (s) =>
      s.kind === kind &&
      (!want || norm(s.name).includes(want) || Object.values(s.values).some((v) => typeof v === "string" && norm(v).includes(want))),
  );
}

/** Up to `max` filled-in fields of a card, as "Label" / "value" lines in template order. */
export function cardPreview(sheet: Sheet, template: SheetField[], max = 3): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const f of template) {
    if (out.length >= max) break;
    const v = sheet.values[f.id];
    if (v === undefined) continue;
    const value = typeof v === "boolean" ? (v ? "Sim" : "Não") : v.replace(/\s+/g, " ").trim();
    if (value) out.push({ label: f.label, value });
  }
  return out;
}

/** Up to two initials of a name, for the character avatar. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = [...words[0]][0] ?? "";
  const last = words.length > 1 ? ([...words[words.length - 1]][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Stable hue (0-359) for a sheet's avatar. */
export function hueOf(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
