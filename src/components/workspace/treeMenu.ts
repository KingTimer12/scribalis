import type { AreaNode } from "../../api/types";
import { pad } from "../../lib/format";
import { chapterNumber, inManuscript, isContainer } from "../../lib/manuscript";
import { openNode, selectNode } from "../../store/actions/open";
import { openPanel } from "../../store/actions/ui";
import { addFiles, createNode, openFile, requestDelete, startNodeRename } from "../../store/actions/workspace";
import { setState, state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

/** New items land in the selected folder (or at the root with nothing selected). */
function creators(inside = false): MenuItem[] {
  // Inside the Manuscrito only chapters and folders fit; media and free texts stay outside.
  if (inside) {
    return [
      { label: "Novo capítulo", act: () => void createNode("chapter") },
      { label: "Nova pasta", act: () => void createNode("folder") },
    ];
  }
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
      // A chapter keeps the chapter share (its node id is the chapter id); the rest share as tree items.
      const draft =
        node.kind === "chapter"
          ? { kind: "chapter" as const, target: id, label: "Capítulo " + pad(chapterNumber(state.area, id)) }
          : { kind: "workspace" as const, target: id, label: node.title || "Item da área" };
      setState("shareDraft", draft);
      openPanel("cloud");
    },
  };
  if (node.kind === "manuscript") return creators(true);
  if (isContainer(node.kind)) return [...creators(inManuscript(state.area, id)), rename, share, del];
  if (node.kind === "text") return [open, rename, share, del];
  if (node.kind === "file") return [open, { label: "Abrir no app padrão", act: () => void openFile(id) }, rename, share, del];
  return [open, rename, share, del];
}

/** Right click targets: selecting first makes "new item" land inside that folder. */
export function selectForMenu(node: AreaNode | null) {
  selectNode(node ? node.id : null);
}
