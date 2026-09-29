import { call } from "./invoke";
import type { AreaNode, Created, DocJSON, NodeKind } from "./types";

/** Full workspace ("area") tree of a book. */
export const areaTree = (bookId: string) => call<AreaNode[]>("workspace_tree", { bookId });

/** Creates a folder, an empty text or an empty chapter under `parent` (root when null) at `index`. */
export const areaCreate = (
  bookId: string,
  parent: string | null,
  index: number,
  kind: Extract<NodeKind, "folder" | "text" | "chapter">,
  title: string,
) => call<Created>("workspace_create", { bookId, parent, index, kind, title });

export const areaRename = (bookId: string, id: string, title: string) => call<AreaNode[]>("workspace_rename", { bookId, id, title });

export const areaSetNotes = (bookId: string, id: string, notes: string) =>
  call<AreaNode[]>("workspace_set_notes", { bookId, id, notes });

/** Index card summary of any node (the Manuscrito included); Rust cuts it at `SYNOPSIS_MAX`. */
export const areaSetSynopsis = (bookId: string, id: string, synopsis: string) =>
  call<AreaNode[]>("workspace_set_synopsis", { bookId, id, synopsis });

/** Moves `id` under `parent` at `index` (position after removing it); crossing the Manuscrito converts text <-> chapter. */
export const areaMove = (bookId: string, id: string, parent: string | null, index: number) =>
  call<AreaNode[]>("workspace_move", { bookId, id, parent, index });

export const areaDelete = (bookId: string, id: string) => call<AreaNode[]>("workspace_delete", { bookId, id });

/** Loads a workspace ("area") text by id. */
export const loadAreaDoc = (bookId: string, id: string) => call<DocJSON>("workspace_load_doc", { bookId, id });

/** Saves a workspace ("area") text; unlike chapters, it carries no word count or "today" stat. */
export const saveAreaDoc = (bookId: string, id: string, doc: DocJSON) =>
  call<void>("workspace_save_doc", { bookId, id, doc });

/** Opens the native file picker and imports the chosen files under `parent`; null when cancelled. */
export const areaPickFiles = (bookId: string, parent: string | null) =>
  call<AreaNode[] | null>("workspace_pick_files", { bookId, parent });

/** Opens an image/attachment node in the OS's default app. */
export const areaOpenFile = (bookId: string, id: string) => call<void>("workspace_open_file", { bookId, id });
