import type { AreaNode } from "../../api/types";
import { STATUS, STATUS_LABEL } from "../../lib/constants";
import { pad } from "../../lib/format";
import { chapterNumber, inManuscript } from "../../lib/manuscript";
import { copyChapter, moveChapterStepFor, setStatus } from "../../store/actions/chapters";
import { openNode, selectNode } from "../../store/actions/open";
import { openPanel } from "../../store/actions/ui";
import {
  addFiles, createNode, createSubdocument, moveIntoManuscript, moveOutOfManuscript, openFile, requestDelete,
  startNodeRename,
} from "../../store/actions/workspace";
import { setState, state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

// Context menus of the tree, one list per node type (spec table "Menu de contexto"). New
// items land in the selected folder: right click selects first, see `selectForMenu`. The
// "Status" submenu is flattened into three items (the context menu has no submenus).

const newChapter: MenuItem = { label: "Novo capítulo", hint: "N", act: () => void createNode("chapter") };
const newFolder: MenuItem = { label: "Nova pasta", hint: "Shift N", act: () => void createNode("folder") };
const outsideCreators = (): MenuItem[] => [
  { label: "Novo texto", hint: "N", act: () => void createNode("text") },
  newFolder,
  { label: "Adicionar imagem ou arquivo…", act: () => void addFiles() },
];

/** "+ Novo" at the foot of the sidebar: what can be created where the selection is. */
export function newMenu(): MenuItem[] {
  const sel = state.areaSel;
  if (sel && inManuscript(state.area, sel)) {
    return [
      { label: "Capítulo", hint: "N", act: () => void createNode("chapter") },
      { label: "Pasta", hint: "Shift N", act: () => void createNode("folder") },
    ];
  }
  return [
    { label: "Texto", hint: "N", act: () => void createNode("text") },
    { label: "Pasta", hint: "Shift N", act: () => void createNode("folder") },
    { label: "Imagem ou arquivo…", act: () => void addFiles() },
  ];
}

/** A chapter shares as a chapter (its node id is the chapter id); a text or outside folder as a tree item. */
function share(node: AreaNode): MenuItem {
  return {
    label: "Compartilhar…",
    act: () => {
      const draft =
        node.kind === "chapter"
          ? { kind: "chapter" as const, target: node.id, label: "Capítulo " + pad(chapterNumber(state.area, node.id)) }
          : { kind: "workspace" as const, target: node.id, label: node.title || "Item da área" };
      setState("shareDraft", draft);
      openPanel("cloud");
    },
  };
}

/** Context menu items for a node, or for the empty tree background when `node` is null. */
export function treeMenu(node: AreaNode | null): MenuItem[] {
  if (!node) return outsideCreators();
  const id = node.id;
  const rename: MenuItem = { label: "Renomear", hint: "F2", act: () => startNodeRename(id) };
  const del: MenuItem = { label: "Excluir", hint: "Del", danger: true, act: () => void requestDelete(id) };
  const open: MenuItem = { label: "Abrir", act: () => void openNode(id) };
  const subdoc: MenuItem = { label: "Novo subdocumento", act: () => void createSubdocument(id) };
  switch (node.kind) {
    case "manuscript":
      return [newChapter, newFolder];
    case "folder":
      return inManuscript(state.area, id)
        ? [newChapter, newFolder, rename, del]
        : [...outsideCreators(), rename, share(node), del];
    case "chapter":
      return [
        subdoc,
        rename,
        ...STATUS.map((s): MenuItem => ({
          label: "Status: " + STATUS_LABEL[s],
          disabled: (node.status ?? "rascunho") === s,
          act: () => setStatus(id, s),
        })),
        { label: "Mover para cima", hint: "Alt Shift ↑", act: () => void moveChapterStepFor(id, -1) },
        { label: "Mover para baixo", hint: "Alt Shift ↓", act: () => void moveChapterStepFor(id, 1) },
        share(node),
        { label: "Copiar para publicar", act: () => void copyChapter(id) },
        { label: "Mover para fora do Manuscrito", act: () => void moveOutOfManuscript(id) },
        del,
      ];
    case "text":
      return [open, subdoc, rename, share(node), { label: "Mover para o Manuscrito", act: () => void moveIntoManuscript(id) }, del];
    case "file":
      return [open, { label: "Abrir no app padrão", act: () => void openFile(id) }, rename, del];
    default:
      return [open, rename, del];
  }
}

/** Right click targets: selecting first makes "new item" land inside that folder. */
export function selectForMenu(node: AreaNode | null) {
  selectNode(node ? node.id : null);
}
