import { produce } from "solid-js/store";
import * as api from "../../api/sheets";
import type { FieldType, SheetField, Sheets } from "../../api/types";
import { plural } from "../../lib/format";
import { askConfirm } from "../confirm";
import { focusTarget } from "../focus";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { run } from "./run";

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  input: "Texto curto",
  textarea: "Texto longo",
  select: "Lista de opções",
  boolean: "Sim ou não",
};

const template = () => state.sheets?.templates[state.sheetKind] ?? [];

/** "Molde": edits a copy of the current kind's template; nothing is saved until "Salvar molde". */
export async function startTemplateEdit() {
  await flushAll();
  // A plain copy: the store's proxies cannot be cloned, and the draft must not alias the template.
  const draft = template().map((f) => (f.options ? { ...f, options: [...f.options] } : { ...f }));
  setState({ templateDraft: draft, sheetSel: null });
}

export function cancelTemplateEdit() {
  setState("templateDraft", null);
  focusTarget("sheets");
}

const editDraft = (fn: (d: SheetField[]) => void) =>
  setState(
    produce((s) => {
      if (s.templateDraft) fn(s.templateDraft);
    }),
  );

/** A new field at the end; Rust gives it an id when the template is saved. */
export const addDraftField = () => editDraft((d) => void d.push({ id: "", label: "", type: "input" }));

export function updateDraftField(i: number, patch: Partial<SheetField>) {
  editDraft((d) => {
    if (!d[i]) return;
    Object.assign(d[i], patch);
    if (d[i].type === "select") d[i].options ??= [];
  });
}

export function moveDraftField(i: number, step: -1 | 1) {
  editDraft((d) => {
    const j = i + step;
    if (j < 0 || j >= d.length) return;
    [d[i], d[j]] = [d[j], d[i]];
  });
}

export const removeDraftField = (i: number) => editDraft((d) => void d.splice(i, 1));

/**
 * Filled-in values the draft would throw away: fields that leave the template, and fields whose
 * type changes (a yes/no turned into a list loses its answers, and so on).
 */
export function draftLosses(sheets: Sheets, kind: keyof Sheets["templates"], draft: SheetField[]): { field: string; sheets: number }[] {
  const out: { field: string; sheets: number }[] = [];
  for (const old of sheets.templates[kind]) {
    const now = draft.find((f) => f.id === old.id);
    if (now && now.type === old.type) continue;
    const count = sheets.sheets.filter((s) => s.kind === kind && old.id in s.values).length;
    if (count) out.push({ field: old.label, sheets: count });
  }
  return out;
}

export async function saveTemplate() {
  const b = state.book;
  const draft = state.templateDraft;
  const sheets = state.sheets;
  if (!b || !draft || !sheets) return;
  const kind = state.sheetKind;
  const losses = draftLosses(sheets, kind, draft);
  if (losses.length) {
    const ok = await askConfirm({
      title: "Salvar o molde?",
      message:
        losses.map((l) => "“" + l.field + "” (" + plural(l.sheets, "ficha", "fichas") + ")").join(", ") +
        ": o que estava preenchido nesses campos pode se perder, porque eles saíram do molde ou mudaram de tipo.",
      confirmLabel: "Salvar",
      danger: true,
    });
    if (!ok) return;
  }
  await run(async () => {
    const saved = await api.sheetsSetTemplate(b.id, kind, draft);
    if (state.book?.id !== b.id) return;
    setState({ sheets: saved, templateDraft: null });
    focusTarget("sheets");
  });
}
