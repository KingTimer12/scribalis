import type { AreaNode } from "../../api/types";
import { inManuscript } from "../../lib/manuscript";
import { createNode } from "../../store/actions/workspace";
import { state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

/** "+ Novo" on a board: what the tree allows inside `folder`, created at the end of its cards. */
export function boardNewMenu(folder: AreaNode): MenuItem[] {
  const at = { parent: folder.id, index: folder.children?.length ?? 0 };
  const newFolder: MenuItem = { label: "Pasta", act: () => void createNode("folder", at) };
  return inManuscript(state.area, folder.id)
    ? [{ label: "Capítulo", act: () => void createNode("chapter", at) }, newFolder]
    : [{ label: "Texto", act: () => void createNode("text", at) }, newFolder];
}
