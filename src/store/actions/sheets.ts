import * as api from "../../api/sheets";
import type { SheetKind } from "../../api/types";
import { askConfirm } from "../confirm";
import { focusTarget } from "../focus";
import { flushAll } from "../saving";
import { setState, state } from "../state";
import { run } from "./run";
import { flashError, homeTarget } from "./ui";

interface KindLabel {
  many: string;
  one: string;
  fresh: string;
  none: string;
  first: string;
  nameOf: string;
}

export const KIND_LABEL: Record<SheetKind, KindLabel> = {
  character: {
    many: "Personagens", one: "personagem", fresh: "Novo personagem", none: "Nenhum personagem ainda.",
    first: "Criar o primeiro personagem", nameOf: "Nome do personagem",
  },
  place: {
    many: "Lugares", one: "lugar", fresh: "Novo lugar", none: "Nenhum lugar ainda.",
    first: "Criar o primeiro lugar", nameOf: "Nome do lugar",
  },
  ability: {
    many: "Habilidades", one: "habilidade", fresh: "Nova habilidade", none: "Nenhuma habilidade ainda.",
    first: "Criar a primeira habilidade", nameOf: "Nome da habilidade",
  },
};

export async function loadSheets() {
  const b = state.book;
  if (!b) return;
  try {
    const sheets = await api.sheetsLoad(b.id);
    if (state.book?.id === b.id) setState("sheets", sheets);
  } catch (e) {
    flashError(e);
  }
}

/** Switches the book between writing and the sheets; the sheets load the first time they show. */
export async function setBookTab(tab: "write" | "sheets") {
  if (state.bookTab === tab) return;
  await flushAll();
  setState({ bookTab: tab, focus: false, panel: null });
  if (tab === "sheets") {
    focusTarget("sheets");
    // Normally loaded with the book; a failed load gets another try here.
    if (!state.sheets) await loadSheets();
  } else {
    focusTarget(homeTarget());
  }
}

export const toggleBookTab = () => setBookTab(state.bookTab === "write" ? "sheets" : "write");

/** Personagens | Lugares: back to the card grid of that kind. */
export async function setSheetKind(kind: SheetKind) {
  if (state.sheetKind === kind && !state.sheetSel && !state.templateDraft) return;
  await flushAll();
  setState({ sheetKind: kind, sheetSel: null, sheetQ: "", templateDraft: null });
}

export async function openSheet(id: string | null) {
  await flushAll();
  setState({ sheetSel: id, templateDraft: null });
  focusTarget(id ? "sheetName" : "sheets");
}

/** A blank sheet of the current kind, opened on its name. */
export function createSheet() {
  const b = state.book;
  if (!b) return;
  const kind = state.sheetKind;
  return run(async () => {
    await flushAll();
    const { id, sheets } = await api.sheetsCreate(b.id, kind, "");
    if (state.book?.id !== b.id) return;
    setState({ sheets, sheetSel: id, templateDraft: null, sheetQ: "" });
    focusTarget("sheetName");
  });
}

export async function requestDeleteSheet(id: string) {
  const b = state.book;
  const sheet = state.sheets?.sheets.find((s) => s.id === id);
  if (!b || !sheet) return;
  const ok = await askConfirm({
    title: "Excluir “" + (sheet.name.trim() || "Sem nome") + "”?",
    message: "A ficha e tudo o que está preenchido nela serão excluídos.",
    confirmLabel: "Excluir",
    danger: true,
  });
  if (!ok) return;
  await run(async () => {
    await flushAll();
    const sheets = await api.sheetsDelete(b.id, id);
    if (state.book?.id !== b.id) return;
    setState({ sheets, sheetSel: state.sheetSel === id ? null : state.sheetSel });
    focusTarget("sheets");
  });
}

/** Opens any sheet, switching to its kind (a reference chip, a mention's card, the palette). */
export async function goToSheet(id: string) {
  const sheet = state.sheets?.sheets.find((s) => s.id === id);
  if (!sheet) return;
  await setBookTab("sheets");
  await setSheetKind(sheet.kind);
  await openSheet(id);
}
