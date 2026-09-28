import { goLibrary } from "../actions/library";
import { goChapters } from "../actions/tabs";
import { addFiles, createNode, deleteNode, sendToChapter, startNodeRename } from "../actions/workspace";
import { openAreaNode, selectedAreaNode } from "../selectors/workspace";
import { state } from "../state";
import { formatCommands } from "./format";
import type { Command } from "./palette";

/** Palette items for the "Área de trabalho" tab (the common ones are appended by the palette). */
export function workspaceCommands(): Command[] {
  const sel = selectedAreaNode();
  const list: Command[] = [
    { label: "Capítulos", hint: "Ctrl 1", act: () => void goChapters() },
    { label: "Novo documento", hint: "N", act: () => void createNode("text") },
    { label: "Nova pasta", hint: "Shift N", act: () => void createNode("folder") },
    { label: "Adicionar arquivos…", hint: "", act: () => void addFiles() },
  ];
  if (sel) {
    const id = sel.id;
    list.push({ label: "Renomear «" + sel.title + "»", hint: "F2", act: () => startNodeRename(id) });
    if (sel.kind === "text") list.push({ label: "Enviar para capítulos", hint: "", act: () => void sendToChapter(id) });
    list.push(
      state.areaConfirm === id
        ? { label: "Confirmar: excluir «" + sel.title + "»?", hint: "Enter", danger: true, act: () => void deleteNode(id) }
        : { label: "Excluir «" + sel.title + "»", hint: "Del", danger: true, keep: true, act: () => void deleteNode(id) },
    );
  }
  list.push({ label: "Voltar às obras", hint: "Ctrl O", act: goLibrary });
  if (openAreaNode()?.kind === "text") list.push(...formatCommands());
  return list;
}
