import { goLibrary } from "../actions/library";
import { startScrivenerImport } from "../actions/scrivener";
import { sidebarOpen, toggleSidebar } from "../actions/sidebar";
import { createChapterHere, createTextHere } from "../actions/newItem";
import { addFiles, createNode, deleteNode, moveIntoManuscript, moveOutOfManuscript, startNodeRename } from "../actions/workspace";
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
    { label: sidebarOpen() ? "Recolher barra lateral" : "Mostrar barra lateral", hint: "Ctrl E", act: toggleSidebar },
    { label: "Novo capítulo", hint: "N", act: () => void createChapterHere() },
    { label: "Novo texto", hint: "N", act: () => void createTextHere() },
    { label: "Nova pasta", hint: "Shift N", act: () => void createNode("folder") },
    { label: "Adicionar arquivos…", hint: "", act: () => void addFiles() },
    { label: "Importar do Scrivener…", hint: "", act: () => importIntoBook() },
  ];
  if (sel && sel.kind !== "manuscript") {
    const id = sel.id;
    list.push({ label: "Renomear «" + sel.title + "»", hint: "F2", act: () => startNodeRename(id) });
    if (sel.kind === "text") list.push({ label: "Mover para o Manuscrito", hint: "", act: () => void moveIntoManuscript(id) });
    if (sel.kind === "chapter") list.push({ label: "Mover para fora do Manuscrito", hint: "", act: () => void moveOutOfManuscript(id) });
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
