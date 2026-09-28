import type { AreaNode } from "../../api/types";
import { openPanel } from "../../store/actions/ui";
import {
  addFiles, createNode, openFile, openNode, requestDelete, selectNode, sendToChapter, startNodeRename,
} from "../../store/actions/workspace";
import { setState } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

/** New items land in the selected folder (or at the root with nothing selected). */
function creators(): MenuItem[] {
  return [
    { label: "Novo documento", act: () => void createNode("text") },
    { label: "Nova pasta", act: () => void createNode("folder") },
    { label: "Adicionar arquivos…", act: () => void addFiles() },
  ];
}

/** Context menu items for a node, or for the empty tree background when `node` is null. */
export function treeMenu(node: AreaNode | null): MenuItem[] {
  if (!node) return creators();
  const id = node.id;
  const rename: MenuItem = { label: "Renomear", act: () => startNodeRename(id) };
  const del: MenuItem = { label: "Excluir", danger: true, act: () => void requestDelete(id) };
  const open: MenuItem = { label: "Abrir", act: () => void openNode(id) };
  const share: MenuItem = {
    label: "Compartilhar…",
    act: () => {
      setState("shareDraft", { kind: "workspace", target: id, label: node.title || "Item da área" });
      openPanel("cloud");
    },
  };
  if (node.kind === "folder") return [...creators(), rename, share, del];
  if (node.kind === "text") return [open, rename, { label: "Enviar para capítulos", act: () => void sendToChapter(id) }, share, del];
  if (node.kind === "file") return [open, { label: "Abrir no app padrão", act: () => void openFile(id) }, rename, share, del];
  return [open, rename, share, del];
}

/** Right click targets: selecting first makes "new item" land inside that folder. */
export function selectForMenu(node: AreaNode | null) {
  selectNode(node ? node.id : null);
}
