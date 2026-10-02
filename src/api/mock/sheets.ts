import type { Sheet, SheetField, SheetKind, Sheets, SheetValue } from "../types";
import { findBook, mockId } from "./db";

// Mirrors the Rust `model::sheets` and `ops::sheets` modules: same starter templates, cleaning,
// value fitting and messages.

const LABEL_MAX = 120;
const OPTIONS_MAX = 50;
const NOT_FOUND = "Ficha não encontrada";

const field = (id: string, label: string, type: SheetField["type"], options?: string[]): SheetField =>
  options ? { id, label, type, options } : { id, label, type };

export const starterSheets = (): Sheets => ({
  version: 1,
  templates: {
    character: [
      field("papel", "Papel", "select", ["Protagonista", "Antagonista", "Coadjuvante", "Figurante"]),
      field("idade", "Idade", "input"),
      field("aparencia", "Aparência", "textarea"),
      field("personalidade", "Personalidade", "textarea"),
      field("vivo", "Vivo", "boolean"),
    ],
    place: [
      field("tipo", "Tipo", "select", ["Cidade", "Construção", "Região", "Natureza", "Outro"]),
      field("descricao", "Descrição", "textarea"),
      field("real", "Existe no mundo real", "boolean"),
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

function fit(value: SheetValue, f: SheetField): SheetValue | null {
  let out: SheetValue;
  if (f.type === "boolean") out = typeof value === "boolean" ? value : value.trim() !== "";
  else if (f.type === "select") {
    if (typeof value !== "string" || !(f.options ?? []).includes(value)) return null;
    out = value;
  } else if (typeof value === "boolean") out = value ? "Sim" : "";
  else if (f.type === "input") out = value.split("\n").map((l) => l.trim()).join(" ");
  else out = value;
  return typeof out === "string" && out.trim() === "" ? null : out;
}

function conform(sheet: Sheet, template: SheetField[]) {
  const values: Record<string, SheetValue> = {};
  for (const [id, v] of Object.entries(sheet.values)) {
    const f = template.find((t) => t.id === id);
    const fitted = f ? fit(v, f) : null;
    if (fitted !== null) values[id] = fitted;
  }
  sheet.values = values;
}

function cleanFields(fields: SheetField[]): SheetField[] {
  const out: SheetField[] = [];
  for (const f of fields) {
    const id = !f.id || out.some((o) => o.id === f.id) ? mockId() : f.id;
    const label = cut(f.label) || "Campo sem nome";
    if (f.type !== "select") {
      out.push({ id, label, type: f.type });
      continue;
    }
    const options: string[] = [];
    for (const o of (f.options ?? []).map(cut)) if (o && !options.includes(o) && options.length < OPTIONS_MAX) options.push(o);
    out.push({ id, label, type: f.type, options });
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
    for (const sheet of s.sheets) if (sheet.kind === kind) conform(sheet, template);
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
    const fitted = value === null ? null : fit(value, f);
    if (fitted === null) delete sheet.values[fieldId];
    else sheet.values[fieldId] = fitted;
  },
  sheets_delete: ({ bookId, id }: { bookId: string; id: string }) => {
    const s = of(bookId);
    find(s, id);
    s.sheets = s.sheets.filter((x) => x.id !== id);
    return s;
  },
};
