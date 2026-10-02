import { UI_SCALE_LABEL } from "../../lib/constants";
import { chapterOrder } from "../../lib/manuscript";
import { fmt, norm, pad } from "../../lib/format";
import { clearCover, pickCover } from "../actions/images";
import { openBook, requestDeleteBook, restoreSamples, startNew, startRename } from "../actions/library";
import { reveal } from "../actions/expanded";
import { openNode } from "../actions/open";
import { cycleUiScale, toggleTheme } from "../actions/prefs";
import { homeTarget, openPanel } from "../actions/ui";
import { startScrivenerImport } from "../actions/scrivener";
import { installUpdate } from "../actions/update";
import { focusTarget } from "../focus";
import { libList, libSelIndex } from "../selectors/library";
import { setState, state } from "../state";
import { chapterCommands } from "./chapter";
import { sheetCommands, sheetHits } from "./sheets";
import { setBookTab } from "../actions/sheets";
import { workspaceCommands } from "./workspace";

export interface Command {
  /** Short left label (chapter number, "obra"). */
  kind?: string;
  label: string;
  hint: string;
  danger?: boolean;
  /** Keeps the palette open when run. */
  keep?: boolean;
  act: () => void;
}

function commonCommands(): Command[] {
  return [
    { label: state.prefs.theme === "dark" ? "Tema claro" : "Tema escuro", hint: "Ctrl J", act: toggleTheme },
    { label: "Tamanho da interface: " + UI_SCALE_LABEL[state.prefs.uiScale], hint: "", keep: true, act: cycleUiScale },
    { label: "Ajustes…", hint: "Ctrl ,", act: () => openPanel("settings") },
    { label: "Atalhos", hint: "Ctrl /", act: () => openPanel("help") },
    { label: "Nuvem", hint: "Ctrl Shift S", act: () => openPanel("cloud") },
    ...(state.update ? [{ label: "Instalar versão " + state.update.version + " (reinicia)", hint: "", act: () => void installUpdate() }] : []),
  ];
}

function libraryCommands(): Command[] {
  const list = libList();
  const cur = list[libSelIndex(list)];
  const out: Command[] = [
    { label: "Nova obra", hint: "N", act: startNew },
    { label: "Importar do Scrivener…", hint: "", act: () => void startScrivenerImport({ type: "new" }) },
  ];
  if (cur) {
    out.push({ label: 'Renomear "' + cur.title + '"', hint: "R", act: () => startRename(cur.id) });
    out.push({ label: (cur.cover ? 'Trocar capa de "' : 'Escolher capa para "') + cur.title + '"', hint: "C", act: () => pickCover(cur.id) });
    if (cur.cover) out.push({ label: "Remover capa (volta a letra)", hint: "Shift C", act: () => clearCover(cur.id) });
    out.push({
      label: 'Excluir "' + cur.title + '"', hint: "Del", danger: true,
      act: () => void requestDeleteBook(cur.id),
    });
  }
  return [...out, ...commonCommands(), { label: "Restaurar obras de exemplo", hint: "", act: restoreSamples }];
}

/** Palette items: Rust search hits, matching books, then commands. */
export function paletteItems(): Command[] {
  const q = norm(state.q.trim());
  let out: Command[] = [];
  const book = state.book;
  if (q && state.view === "book" && book) {
    const order = chapterOrder(state.area);
    for (const hit of state.hits) {
      const c = order[hit.index];
      if (!c || c.id !== hit.chapterId) continue;
      const id = c.id;
      out.push({
        kind: pad(hit.index + 1), label: c.title || "Sem título", hint: fmt(c.words ?? 0) + " pal.",
        act: () => { void setBookTab("write"); reveal(id); void openNode(id); },
      });
    }
  }
  if (q && state.view === "book" && book) out.push(...sheetHits(q));
  if (q) {
    for (const b of state.library) {
      if (b.id !== state.curId && norm(b.title).includes(q)) {
        const id = b.id;
        out.push({ kind: "obra", label: b.title, hint: "", act: () => openBook(id) });
      }
    }
  }
  const cmds =
    state.view === "library" || !book
      ? libraryCommands()
      : state.bookTab === "sheets"
        ? [...sheetCommands(), ...commonCommands()]
        : [...chapterCommands(), ...workspaceCommands(), ...sheetCommands(), ...commonCommands()];
  for (const c of cmds) if (!q || norm(c.label).includes(q)) out.push(c);
  if (q) out = out.slice(0, 9);
  return out;
}

export function runCommand(cmd: Command) {
  if (cmd.keep) return cmd.act();
  focusTarget(homeTarget());
  setState({ panel: null, q: "", pIdx: 0, hits: [] });
  cmd.act();
}
