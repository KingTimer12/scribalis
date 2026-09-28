import { call } from "./invoke";
import type { DocJSON } from "./types";

/** Loads a workspace ("area") text by id. */
export const loadAreaDoc = (bookId: string, id: string) => call<DocJSON>("workspace_load_doc", { bookId, id });

/** Saves a workspace ("area") text; unlike chapters, it carries no word count or "today" stat. */
export const saveAreaDoc = (bookId: string, id: string, doc: DocJSON) =>
  call<void>("workspace_save_doc", { bookId, id, doc });
