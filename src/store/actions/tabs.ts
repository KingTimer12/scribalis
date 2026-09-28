import * as chapterApi from "../../api/chapter";
import { loadAreaDoc } from "../../api/workspace";
import { docWords } from "../../lib/doc";
import { focusTarget } from "../focus";
import { flushAll, settleDocSave, swapDocument } from "../saving";
import { openAreaNode } from "../selectors/workspace";
import { setState, state } from "../state";
import { flashError } from "./ui";
import { loadArea } from "./workspace";

/** Screen state reset when switching between the book's two tabs. */
const TAB_RESET = { panel: null, q: "", focus: false, tripleHint: false, confirmDel: false } as const;

/** Opens the "Área de trabalho" tab of the open book, reopening the text that was open there. */
export async function goWorkspace() {
  const b = state.book;
  if (!b || state.view === "workspace") return;
  try {
    await flushAll();
    await loadArea();
    if (state.book?.id !== b.id) return;
    const open = openAreaNode();
    // A text that can no longer be read just closes: the tab still opens on the tree.
    const doc = open?.kind === "text" ? await loadAreaDoc(b.id, open.id).catch(() => null) : null;
    if (open && doc) {
      const shown = await swapDocument(doc, { bookId: b.id, docId: open.id, scope: "area" }, () => {
        if (state.book?.id !== b.id) return false;
        setState({ view: "workspace", ...TAB_RESET });
      });
      if (shown) focusTarget("body", "end");
      return;
    }
    // Text typed while the tree loaded: save it before the chapter editor unmounts.
    await settleDocSave();
    if (state.book?.id !== b.id) return;
    focusTarget("tree");
    setState({ view: "workspace", ...TAB_RESET, areaOpen: open && open.kind !== "text" ? open.id : null });
  } catch (e) {
    flashError(e);
  }
}

/** Back to the "Capítulos" tab, on the book's current chapter. */
export async function goChapters() {
  const b = state.book;
  if (!b || state.view !== "workspace") return;
  try {
    await flushAll();
    const chapter = b.chapters[b.cur];
    const doc = await chapterApi.loadChapter(b.id, chapter.id);
    const shown = await swapDocument(doc, { bookId: b.id, docId: chapter.id, scope: "chapter" }, () => {
      if (state.book?.id !== b.id) return false;
      setState({ view: "editor", ...TAB_RESET, liveWords: docWords(doc) });
    });
    if (shown) focusTarget("body", "end");
  } catch (e) {
    flashError(e);
  }
}
