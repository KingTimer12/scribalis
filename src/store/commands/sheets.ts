import type { SheetKind } from "../../api/types";
import { norm } from "../../lib/format";
import { createSheet, KIND_LABEL, openSheet, setBookTab, setSheetKind } from "../actions/sheets";
import { startTemplateEdit } from "../actions/sheetTemplate";
import { state } from "../state";
import type { Command } from "./palette";

async function newSheet(kind: SheetKind) {
  await setBookTab("sheets");
  await setSheetKind(kind);
  await createSheet();
}

/** Palette commands for the book's sheets. */
export function sheetCommands(): Command[] {
  const onSheets = state.bookTab === "sheets";
  const list: Command[] = [
    onSheets
      ? { label: "Voltar para a escrita", hint: "Ctrl Shift F", act: () => void setBookTab("write") }
      : { label: "Fichas: personagens e lugares", hint: "Ctrl Shift F", act: () => void setBookTab("sheets") },
    { label: "Novo personagem", hint: "", act: () => void newSheet("character") },
    { label: "Novo lugar", hint: "", act: () => void newSheet("place") },
  ];
  if (onSheets) {
    list.push({ label: "Editar molde de " + KIND_LABEL[state.sheetKind].one, hint: "", act: () => void startTemplateEdit() });
  }
  return list;
}

/** Loaded sheets whose name matches the palette query; running one opens it. */
export function sheetHits(q: string): Command[] {
  const want = norm(q);
  return (state.sheets?.sheets ?? [])
    .filter((s) => s.name.trim() && norm(s.name).includes(want))
    .map((s) => ({
      kind: "ficha",
      label: s.name,
      hint: KIND_LABEL[s.kind].one,
      act: async () => {
        await setBookTab("sheets");
        await setSheetKind(s.kind);
        await openSheet(s.id);
      },
    }));
}
