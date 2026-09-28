import { insertSeparator } from "../../editor/bridge";
import { FONT_LABEL, STATUS_LABEL, WIDTH_LABEL } from "../../lib/constants";
import { fmt, norm, pad } from "../../lib/format";
import { setBookAuthor, setSeparatorText } from "../actions/book";
import {
  copyCurrentChapter, cycleStatus, deleteCurrentChapter, goChapter, insertChapterAt, moveChapter,
} from "../actions/chapters";
import { clearBookImage, clearCover, insertChapterImage, pickBookImage, pickCover } from "../actions/images";
import { goLibrary, openBook, restoreSamples, startNew, startRename } from "../actions/library";
import { cycleFont, cycleGoal, cycleWidth, toggleTheme } from "../actions/prefs";
import { goWorkspace } from "../actions/tabs";
import { homeTarget, openPanel } from "../actions/ui";
import { startScrivenerImport } from "../actions/scrivener";
import { installUpdate } from "../actions/update";
import { focusTarget } from "../focus";
import { currentChapter } from "../selectors/book";
import { libList, libSelIndex } from "../selectors/library";
import { setState, state } from "../state";
import { formatCommands } from "./format";
import { promptFor } from "./prompt";
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
    { label: "Atalhos", hint: "Ctrl /", act: () => openPanel("help") },
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
      act: () => { focusTarget("lib"); setState("libConfirm", cur.id); },
    });
  }
  return [...out, ...commonCommands(), { label: "Restaurar obras de exemplo", hint: "", act: restoreSamples }];
}

function bookSettingsCommands(): Command[] {
  const b = state.book!;
  const sep = b.separator;
  return [
    { label: "Autor da obra" + (b.author ? ": " + b.author : "…"), hint: "", keep: true, act: () => promptFor("Autor", b.author, setBookAuthor) },
    {
      label: "Separador: texto" + (sep.type === "text" ? " (" + sep.text + ")" : "…"), hint: "", keep: true,
      act: () => promptFor("Separador", sep.type === "text" ? sep.text : "* * *", setSeparatorText),
    },
    { label: "Separador: imagem…", hint: "", act: () => pickBookImage("separator") },
    { label: "Moldura superior: escolher imagem", hint: "", act: () => pickBookImage("header") },
    ...(b.header ? [{ label: "Moldura superior: remover", hint: "", act: () => clearBookImage("header") }] : []),
    { label: "Moldura inferior: escolher imagem", hint: "", act: () => pickBookImage("footer") },
    ...(b.footer ? [{ label: "Moldura inferior: remover", hint: "", act: () => clearBookImage("footer") }] : []),
    { label: "Inserir imagem no capítulo", hint: "Ctrl Shift I", act: insertChapterImage },
    { label: "Inserir separador", hint: "Ctrl Enter", act: insertSeparator },
    { label: "Capa da obra", hint: "", act: () => pickCover(b.id) },
  ];
}

function editorCommands(): Command[] {
  const b = state.book;
  const c = currentChapter();
  if (!b || !c) return commonCommands();
  const cur = b.cur;
  const list: Command[] = [
    { label: "Novo capítulo", hint: "Enter ×3", act: () => insertChapterAt(cur + 1) },
    { label: "Voltar às obras", hint: "Ctrl O", act: goLibrary },
    { label: "Área de trabalho", hint: "Ctrl 2", act: () => void goWorkspace() },
    { label: "Índice de capítulos", hint: "Ctrl E", act: () => openPanel("index") },
    { label: "Notas do capítulo", hint: "Ctrl ;", act: () => openPanel("notes") },
    { label: state.focus ? "Sair do modo foco" : "Modo foco", hint: "Ctrl .", act: () => setState("focus", !state.focus) },
    { label: "Mudar status  (" + STATUS_LABEL[c.status] + ")", hint: "Alt S", act: cycleStatus },
    { label: "Capítulo anterior", hint: "Alt ↑", act: () => goChapter(cur - 1) },
    { label: "Próximo capítulo", hint: "Alt ↓", act: () => goChapter(cur + 1) },
    { label: "Mover capítulo para cima", hint: "Alt Shift ↑", act: () => moveChapter(cur, -1) },
    { label: "Mover capítulo para baixo", hint: "Alt Shift ↓", act: () => moveChapter(cur, 1) },
    { label: "Copiar capítulo", hint: "", act: copyCurrentChapter },
    { label: "Meta diária: " + fmt(state.prefs.goal) + " palavras", hint: "", act: cycleGoal },
    { label: "Largura do texto: " + WIDTH_LABEL[state.prefs.width], hint: "", act: cycleWidth },
    { label: "Tamanho da letra: " + FONT_LABEL[state.prefs.font], hint: "", act: cycleFont },
    { label: "Renomear obra", hint: "", act: () => focusTarget("book", "end") },
    ...formatCommands(),
    ...bookSettingsCommands(),
    ...commonCommands(),
  ];
  list.push(
    state.confirmDel
      ? { label: "Confirmar: excluir o capítulo " + pad(cur + 1) + "?", hint: "Enter", danger: true, act: deleteCurrentChapter }
      : { label: "Excluir capítulo", hint: "", danger: true, keep: true, act: () => setState("confirmDel", true) },
  );
  return list;
}

/** Palette items: Rust search hits, matching books, then commands. */
export function paletteItems(): Command[] {
  const q = norm(state.q.trim());
  let out: Command[] = [];
  const book = state.book;
  if (q && state.view === "editor" && book) {
    for (const hit of state.hits) {
      const c = book.chapters[hit.index];
      if (!c) continue;
      out.push({ kind: pad(hit.index + 1), label: c.title || "Sem título", hint: fmt(c.words) + " pal.", act: () => goChapter(hit.index) });
    }
  }
  if (q) {
    for (const b of state.library) {
      if (b.id !== state.curId && norm(b.title).includes(q)) {
        const id = b.id;
        out.push({ kind: "obra", label: b.title, hint: "", act: () => openBook(id) });
      }
    }
  }
  const cmds =
    state.view === "library"
      ? libraryCommands()
      : state.view === "workspace" && book
        ? [...workspaceCommands(), ...commonCommands()]
        : editorCommands();
  for (const c of cmds) if (!q || norm(c.label).includes(q)) out.push(c);
  if (q) out = out.slice(0, 9);
  return out;
}

export function runCommand(cmd: Command) {
  if (cmd.keep) return cmd.act();
  focusTarget(homeTarget());
  setState({ panel: null, q: "", pIdx: 0, confirmDel: false, hits: [] });
  cmd.act();
}
