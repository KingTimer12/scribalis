import type { AreaNode } from "../../api/types";
import { isFolder } from "../../lib/tree";
import { mainTab } from "../actions/tabs";
import { openAreaNode } from "./workspace";

/** The open node when it is a document with subdocuments: its board is one tab away. */
export const openDocWithSubdocs = (): AreaNode | null => {
  const n = openAreaNode();
  return n && !isFolder(n.kind) && n.children?.length ? n : null;
};

/**
 * Node whose children show as index cards: the open folder (or Manuscrito), or the open
 * document with subdocuments while its Quadro tab is on. Null when the board is not shown.
 */
export const boardNode = (): AreaNode | null => {
  const n = openAreaNode();
  if (n && isFolder(n.kind)) return n;
  return mainTab() === "board" ? openDocWithSubdocs() : null;
};
