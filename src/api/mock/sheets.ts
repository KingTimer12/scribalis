import type { Sheet, SheetField, SheetKind, Sheets, SheetValue } from "../types";
import { norm } from "../../lib/format";
import { findBook, mockId } from "./db";

// Mirrors the Rust `model::sheets` and `ops::sheets` modules: same starter templates, cleaning,
// value fitting and messages.

const LABEL_MAX = 120;
const OPTIONS_MAX = 50;
const NOT_FOUND = "Ficha não encontrada";

const field = (id: string, label: string, type: SheetField["type"], options?: string[]): SheetField =>
  options ? { id, label, type, options } : { id, label, type };

const reference = (id: string, label: string, target: SheetKind, multiple: boolean): SheetField =>
  multiple ? { id, label, type: "reference", target, multiple } : { id, label, type: "reference", target };

export const starterSheets = (): Sheets => ({
  version: 1,
  templates: {
    character: [
      field("papel", "Papel", "select", ["Protagonista", "Antagonista", "Coadjuvante", "Figurante"]),
      field("idade", "Idade", "input"),
      reference("nascimento", "Nascimento", "place", false),
      field("aparencia", "Aparência", "textarea"),
      field("personalidade", "Personalidade", "tags"),
      reference("habilidades", "Habilidades", "ability", true),
      field("vivo", "Vivo", "boolean"),
    ],
    place: [
      field("tipo", "Tipo", "select", ["Cidade", "Construção", "Região", "Natureza", "Outro"]),
      field("descricao", "Descrição", "textarea"),
      field("real", "Existe no mundo real", "boolean"),
    ],
    ability: [
      field("tipo", "Tipo", "select", ["Magia", "Técnica", "Dom", "Objeto"]),
      field("descricao", "Descrição", "textarea"),
      field("limite", "Custo ou limite", "textarea"),
      field("marcas", "Marcas", "tags"),
    ],
  },
  sheets: [],
});

/** Sheets by book id; a book gets the starter templates on first use. */
export const sheetsDb: Record<string, Sheets> = {};

function of(bookId: string): Sheets {
  findBook(bookId);
  return (sheetsDb[bookId] ??= starterSheets());
}

const cut = (text: string) => [...text.trim()].slice(0, LABEL_MAX).join("");

type Kinds = Map<string, SheetKind>;
const kindsOf = (s: Sheets): Kinds => new Map(s.sheets.map((x) => [x.id, x.kind]));

const texts = (v: SheetValue): string[] => (typeof v === "boolean" ? [] : typeof v === "string" ? [v] : v);

function cleanTags(tags: string[]): string[] {
  const out: string[] = [];
  for (const t of tags.map(cut)) {
    if (t && out.length < OPTIONS_MAX && !out.some((o) => norm(o) === norm(t))) out.push(t);
  }
  return out;
}

function fit(value: SheetValue, f: SheetField, kinds: Kinds): SheetValue | null {
  let out: SheetValue;
  switch (f.type) {
    case "boolean":
      out = typeof value === "boolean" ? value : texts(value).some((t) => t.trim() !== "");
      break;
    case "select": {
      const hit = texts(value).find((t) => (f.options ?? []).includes(t));
      if (hit === undefined) return null;
      out = hit;
      break;
    }
    case "tags":
      out = cleanTags(typeof value === "string" ? value.split(",") : texts(value));
      break;
    case "reference": {
      if (!f.target) return null;
      const ids: string[] = [];
      for (const id of texts(value)) if (kinds.get(id) === f.target && !ids.includes(id) && ids.length < OPTIONS_MAX) ids.push(id);
      if (f.multiple) out = ids;
      else if (ids.length) out = ids[0];
      else return null;
      break;
    }
    default:
      if (typeof value === "boolean") out = value ? "Sim" : "";
      else if (Array.isArray(value)) out = value.join(", ");
      else if (f.type === "input") out = value.split("\n").map((l) => l.trim()).join(" ");
      else out = value;
  }
  if (typeof out === "string" && out.trim() === "") return null;
  if (Array.isArray(out) && !out.length) return null;
  return out;
}

const sameFamily = (a: SheetField, b: SheetField) => (a.type === "reference") === (b.type === "reference");

function conform(sheet: Sheet, template: SheetField[], previous: SheetField[], kinds: Kinds) {
  const values: Record<string, SheetValue> = {};
  for (const [id, v] of Object.entries(sheet.values)) {
    const f = template.find((t) => t.id === id);
    if (!f) continue;
    const p = previous.find((t) => t.id === id);
    if (p && !sameFamily(p, f)) continue;
    const fitted = fit(v, f, kinds);
    if (fitted !== null) values[id] = fitted;
  }
  sheet.values = values;
}

function cleanFields(fields: SheetField[]): SheetField[] {
  const out: SheetField[] = [];
  for (const f of fields) {
    const id = !f.id || out.some((o) => o.id === f.id) ? mockId() : f.id;
    const label = cut(f.label) || "Campo sem nome";
    if (f.type === "select") {
      const options: string[] = [];
      for (const o of (f.options ?? []).map(cut)) if (o && !options.includes(o) && options.length < OPTIONS_MAX) options.push(o);
      out.push({ id, label, type: f.type, options });
    } else if (f.type === "reference") {
      out.push(reference(id, label, f.target ?? "character", !!f.multiple));
    } else {
      out.push({ id, label, type: f.type });
    }
  }
  return out;
}

function find(s: Sheets, id: string): Sheet {
  const sheet = s.sheets.find((x) => x.id === id);
  if (!sheet) throw NOT_FOUND;
  return sheet;
}

export const sheets = {
  sheets_load: ({ bookId }: { bookId: string }) => of(bookId),
  sheets_set_template: ({ bookId, kind, fields }: { bookId: string; kind: SheetKind; fields: SheetField[] }) => {
    const s = of(bookId);
    const template = cleanFields(fields);
    const kinds = kindsOf(s);
    for (const sheet of s.sheets) if (sheet.kind === kind) conform(sheet, template, s.templates[kind], kinds);
    s.templates[kind] = template;
    return s;
  },
  sheets_create: ({ bookId, kind, name }: { bookId: string; kind: SheetKind; name: string }) => {
    const s = of(bookId);
    const id = mockId();
    s.sheets.push({ id, kind, name: cut(name), values: {} });
    return { id, sheets: s };
  },
  sheets_rename: ({ bookId, id, name }: { bookId: string; id: string; name: string }) => {
    find(of(bookId), id).name = cut(name);
  },
  sheets_set_value: ({ bookId, id, field: fieldId, value }: { bookId: string; id: string; field: string; value: SheetValue | null }) => {
    const s = of(bookId);
    const sheet = find(s, id);
    const f = s.templates[sheet.kind].find((t) => t.id === fieldId);
    if (!f) throw "Este campo não existe mais no molde";
    const fitted = value === null ? null : fit(value, f, kindsOf(s));
    if (fitted === null) delete sheet.values[fieldId];
    else sheet.values[fieldId] = fitted;
  },
  sheets_delete: ({ bookId, id }: { bookId: string; id: string }) => {
    const s = of(bookId);
    find(s, id);
    s.sheets = s.sheets.filter((x) => x.id !== id);
    // References to the deleted sheet go with it.
    const kinds = kindsOf(s);
    for (const sheet of s.sheets) conform(sheet, s.templates[sheet.kind], s.templates[sheet.kind], kinds);
    return s;
  },
};
