import { call } from "./invoke";
import type { AreaNode, Created, DocJSON, FromChapterResult, NodeKind, ToChapterResult } from "./types";

/** Full workspace ("area") tree of a book. */
export const areaTree = (bookId: string) => call<AreaNode[]>("workspace_tree", { bookId });

/** Creates a folder or an empty text under `parent` (root when null) at `index`. */
export const areaCreate = (bookId: string, parent: string | null, index: number, kind: Extract<NodeKind, "folder" | "text">, title: string) =>
  call<Created>("workspace_create", { bookId, parent, index, kind, title });

export const areaRename = (bookId: string, id: string, title: string) => call<AreaNode[]>("workspace_rename", { bookId, id, title });

export const areaSetNotes = (bookId: string, id: string, notes: string) =>
  call<AreaNode[]>("workspace_set_notes", { bookId, id, notes });

/** Moves `id` under `parent` at `index` (position after removing the dragged node). */
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

/** Promotes a text node to the last chapter of the book. */
export const areaToChapter = (bookId: string, id: string) => call<ToChapterResult>("workspace_to_chapter", { bookId, id });

/** Turns a chapter into a text at the end of the workspace root (the inverse of `areaToChapter`). */
export const areaFromChapter = (bookId: string, chapterId: string) =>
  call<FromChapterResult>("workspace_from_chapter", { bookId, chapterId });

/** Opens an image/attachment node in the OS's default app. */
export const areaOpenFile = (bookId: string, id: string) => call<void>("workspace_open_file", { bookId, id });
