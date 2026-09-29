import { goLibrary } from "../actions/library";
import { startScrivenerImport } from "../actions/scrivener";
import { addFiles, createNode, deleteNode, startNodeRename } from "../actions/workspace";
import { focusTarget } from "../focus";
import { openAreaNode, selectedAreaNode } from "../selectors/workspace";
import { state } from "../state";
import { formatCommands } from "./format";
import type { Command } from "./palette";

/** Imports a Scrivener project into the open book. */
function importIntoBook() {
  const id = state.book?.id;
  if (id) void startScrivenerImport({ type: "book", id });
}

/** Palette items for the book's tree (the chapter and common ones are added by the palette). */
export function workspaceCommands(): Command[] {
  const sel = selectedAreaNode();
  const list: Command[] = [
    { label: "Novo documento", hint: "N", act: () => void createNode("text") },
    { label: "Nova pasta", hint: "Shift N", act: () => void createNode("folder") },
    { label: "Adicionar arquivos…", hint: "", act: () => void addFiles() },
    { label: "Importar do Scrivener…", hint: "", act: () => importIntoBook() },
  ];
  if (sel && sel.kind !== "manuscript") {
    const id = sel.id;
    list.push({ label: "Renomear «" + sel.title + "»", hint: "F2", act: () => startNodeRename(id) });
    list.push(
      state.areaConfirm === id
        ? { label: "Confirmar: excluir «" + sel.title + "»?", hint: "Enter", danger: true, act: () => void deleteNode(id) }
        : { label: "Excluir «" + sel.title + "»", hint: "Del", danger: true, keep: true, act: () => void deleteNode(id) },
    );
  }
  list.push({ label: "Renomear obra", hint: "", act: () => focusTarget("book", "end") });
  list.push({ label: "Voltar às obras", hint: "Ctrl O", act: goLibrary });
  if (openAreaNode()?.kind === "text") list.push(...formatCommands());
  return list;
}
