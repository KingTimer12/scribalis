import type { Sheet, SheetField, SheetKind, Sheets, SheetValue } from "../api/types";
import { norm } from "./format";

/** Name of a sheet by id, for reference fields and mentions; undefined when it is gone. */
export type NameOf = (id: string) => string | undefined;

export const nameLookup = (sheets: Sheets | null): NameOf => {
  const names = new Map((sheets?.sheets ?? []).map((s) => [s.id, s.name.trim() || "Sem nome"]));
  return (id) => names.get(id);
};

const asList = (v: SheetValue): string[] => (typeof v === "boolean" ? [] : typeof v === "string" ? [v] : v);

/** A value as one line of text: yes/no, the names a reference points at, tags joined. */
export function valueText(v: SheetValue, field: SheetField, nameOf: NameOf): string {
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (field.type === "reference") return asList(v).map(nameOf).filter(Boolean).join(", ");
  return asList(v).join(", ").replace(/\s+/g, " ").trim();
}

/** Sheets of `kind` whose name, text or tags match `q` (accents and case ignored). */
export function filterSheets(sheets: Sheets, kind: SheetKind, q: string): Sheet[] {
  const want = norm(q.trim());
  const template = sheets.templates[kind];
  const searchable = (s: Sheet) =>
    template.filter((f) => f.type !== "reference").flatMap((f) => (s.values[f.id] === undefined ? [] : asList(s.values[f.id])));
  return sheets.sheets.filter(
    (s) => s.kind === kind && (!want || norm(s.name).includes(want) || searchable(s).some((t) => norm(t).includes(want))),
  );
}

/** Up to `max` filled-in fields of a card, as "Label" / "value" lines in template order. */
export function cardPreview(sheet: Sheet, template: SheetField[], nameOf: NameOf, max = 3): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const f of template) {
    if (out.length >= max) break;
    const v = sheet.values[f.id];
    if (v === undefined) continue;
    const value = valueText(v, f, nameOf);
    if (value) out.push({ label: f.label, value });
  }
  return out;
}

/** Tags already used in a field across the kind's sheets, without repeats, in alphabetical order. */
export function tagPool(sheets: Sheets, kind: SheetKind, fieldId: string): string[] {
  const seen = new Map<string, string>();
  for (const s of sheets.sheets) {
    const v = s.kind === kind ? s.values[fieldId] : undefined;
    if (Array.isArray(v)) for (const t of v) if (!seen.has(norm(t))) seen.set(norm(t), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Sheets whose name matches `q`, for the @ menu: names starting with it first. */
export function mentionMatches(sheets: Sheets | null, q: string, max = 8): Sheet[] {
  const want = norm(q.trim());
  const named = (sheets?.sheets ?? []).filter((s) => s.name.trim());
  const hits = want ? named.filter((s) => norm(s.name).includes(want)) : named;
  const starts = (s: Sheet) => (norm(s.name).startsWith(want) ? 0 : 1);
  return [...hits].sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, "pt-BR")).slice(0, max);
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

/** Avatar text: initials for a character, a mark for places and abilities. */
export const avatarText = (sheet: Sheet) => (sheet.kind === "character" ? initials(sheet.name) : sheet.kind === "place" ? "⌖" : "✦");
