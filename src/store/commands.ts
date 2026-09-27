import { STATUS_LABEL, WIDTH_LABEL, FONT_LABEL } from "../lib/constants";
import { fmt, norm, pad, wc } from "../lib/format";
import {
  copyCurrentChapter,
  cycleStatus,
  deleteCurrentChapter,
  goChapter,
  insertChapter,
  moveChapter,
} from "./chapters";
import { focusTarget } from "./focus";
import {
  goLibrary,
  openBook,
  pickCover,
  restoreSamples,
  setCover,
  startNew,
  startRename,
} from "./library";
import { currentBook, currentChapter, libList, libSelIndex, setState, state } from "./state";
import {
  cycleFont,
  cycleGoal,
  cycleWidth,
  homeTarget,
  openPanel,
  toggleTheme,
} from "./ui";

export interface Command {
  /** Rótulo curto à esquerda (nº do capítulo, "obra"). */
  kind?: string;
  label: string;
  hint: string;
  danger?: boolean;
  /** Mantém a paleta aberta ao executar. */
  keep?: boolean;
  act: () => void;
}

function commonCommands(): Command[] {
  return [
    { label: state.prefs.theme === "dark" ? "Tema claro" : "Tema escuro", hint: "Ctrl J", act: toggleTheme },
    { label: "Atalhos", hint: "Ctrl /", act: () => openPanel("help") },
  ];
}

function libraryCommands(): Command[] {
  const list = libList();
  const cur = list[libSelIndex(list)];
  const out: Command[] = [{ label: "Nova obra", hint: "N", act: startNew }];
  if (cur) {
    out.push({ label: 'Renomear "' + cur.title + '"', hint: "R", act: () => startRename(cur.id) });
    out.push({
      label: (cur.cover ? 'Trocar capa de "' : 'Escolher capa para "') + cur.title + '"',
      hint: "C",
      act: () => pickCover(cur.id),
    });
    if (cur.cover) {
      out.push({ label: "Remover capa (volta a letra)", hint: "Shift C", act: () => setCover(cur.id, null) });
    }
    out.push({
      label: 'Excluir "' + cur.title + '"',
      hint: "Del",
      danger: true,
      act: () => {
        focusTarget("lib");
        setState("libConfirm", cur.id);
      },
    });
  }
  out.push(...commonCommands());
  out.push({ label: "Restaurar obras de exemplo", hint: "", act: restoreSamples });
  return out;
}

function editorCommands(): Command[] {
  const b = currentBook();
  const c = currentChapter();
  if (!b || !c) return commonCommands();
  const cur = b.cur;
  const list: Command[] = [
    { label: "Novo capítulo", hint: "Enter ×3", act: () => insertChapter(cur + 1) },
    { label: "Voltar às obras", hint: "Ctrl O", act: goLibrary },
    { label: "Índice de capítulos", hint: "Ctrl E", act: () => openPanel("index") },
    { label: "Notas do capítulo", hint: "Ctrl ;", act: () => openPanel("notes") },
    {
      label: state.focus ? "Sair do modo foco" : "Modo foco",
      hint: "Ctrl .",
      act: () => setState("focus", !state.focus),
    },
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
    { label: "Capa da obra", hint: "", act: () => pickCover(state.curId) },
    ...commonCommands(),
  ];
  list.push(
    state.confirmDel
      ? {
          label: "Confirmar: excluir o capítulo " + pad(cur + 1) + "?",
          hint: "Enter",
          danger: true,
          act: deleteCurrentChapter,
        }
      : {
          label: "Excluir capítulo",
          hint: "",
          danger: true,
          keep: true,
          act: () => setState("confirmDel", true),
        },
  );
  return list;
}

/** Itens da paleta: capítulos e obras que batem com a busca, depois comandos. */
export function paletteItems(): Command[] {
  const q = norm(state.q.trim());
  let out: Command[] = [];
  const book = currentBook();
  if (q && state.view === "editor" && book) {
    book.chapters.forEach((c, i) => {
      const t = c.title || "Sem título";
      if (norm(t).includes(q) || pad(i + 1).startsWith(q) || norm(c.body).includes(q)) {
        out.push({ kind: pad(i + 1), label: t, hint: fmt(wc(c.body)) + " pal.", act: () => goChapter(i) });
      }
    });
  }
  if (q) {
    for (const b of state.books) {
      if (b.id !== state.curId && norm(b.title).includes(q)) {
        const id = b.id;
        out.push({ kind: "obra", label: b.title, hint: "", act: () => openBook(id) });
      }
    }
  }
  const cmds = state.view === "library" ? libraryCommands() : editorCommands();
  for (const c of cmds) if (!q || norm(c.label).includes(q)) out.push(c);
  if (q) out = out.slice(0, 9);
  return out;
}

export function runCommand(cmd: Command) {
  if (cmd.keep) return cmd.act();
  focusTarget(homeTarget());
  setState({ panel: null, q: "", pIdx: 0, confirmDel: false });
  cmd.act();
}

export function paletteKey(e: KeyboardEvent, items: Command[]) {
  const n = items.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    if (!n) return;
    const d = e.key === "ArrowDown" ? 1 : -1;
    setState("pIdx", (state.pIdx + d + n) % n);
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    const it = items[Math.min(state.pIdx, n - 1)];
    if (it) runCommand(it);
  }
}
