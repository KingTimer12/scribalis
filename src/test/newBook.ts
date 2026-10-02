import { mockInvoke } from "../api/mock";
import type { AreaNode, BookMeta, BookSummary } from "../api/types";
import { setState } from "../store/state";

/** A fresh mock book with its tree in the store, isolated from the samples and other tests. */
export async function newBook(): Promise<BookMeta> {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  const book = await mockInvoke<BookMeta>("book_open", { id: created.id });
  const area = await mockInvoke<AreaNode[]>("workspace_tree", { bookId: book.id });
  setState({
    book, area, areaSel: null, areaOpen: null, areaExpanded: [],
    areaRenaming: null, areaRenameVal: "", toast: "", focus: false,
    boardExcerpts: {}, boardSel: null,
  });
  return book;
}
