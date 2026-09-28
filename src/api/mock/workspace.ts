import type { DocJSON } from "../types";

// Minimal stand-in so `workspace_load_doc`/`workspace_save_doc` don't error out of Tauri.
// Task 7 replaces this with the full workspace mock (tree, persistence per book, etc).
const docs = new Map<string, DocJSON>();
const emptyDoc = (): DocJSON => ({ type: "doc", content: [] });

type Ids = { bookId: string; id: string };

export const workspace = {
  workspace_load_doc: ({ bookId, id }: Ids): DocJSON => structuredClone(docs.get(bookId + "/" + id) ?? emptyDoc()),
  workspace_save_doc: ({ bookId, id, doc }: Ids & { doc: DocJSON }): void => {
    docs.set(bookId + "/" + id, structuredClone(doc));
  },
};
