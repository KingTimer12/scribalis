import { insertSeparator } from "../../editor/bridge";
import { STATUS_LABEL, WIDTH_LABEL } from "../../lib/constants";
import { fmt, pad } from "../../lib/format";
import { setBookAuthor, setSeparatorText } from "../actions/book";
import { copyChapter, cycleStatus, moveChapterStep, newChapterAfterCurrent } from "../actions/chapters";
import { backupNow, fetchComments } from "../actions/cloud";
import { clearBookImage, insertChapterImage, pickBookImage, pickCover } from "../actions/images";
import { goChapterStep } from "../actions/open";
import { cycleGoal, cycleWidth, textBigger, textSmaller } from "../actions/prefs";
import { openPanel } from "../actions/ui";
import { currentChapter, currentNumber } from "../selectors/book";
import { setState, state } from "../state";
import { formatCommands } from "./format";
import type { Command } from "./palette";
import { promptFor } from "./prompt";

/** Frame, separator, cover and author: book settings that only make sense while writing a chapter. */
export function bookSettingsCommands(): Command[] {
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

/** Palette items for the open chapter; the tree's and the common ones are appended by the palette. */
export function chapterCommands(): Command[] {
  const c = currentChapter();
  if (!state.book || !c) return [];
  const status = c.status ?? "rascunho";
  const share = () => {
    setState("shareDraft", { kind: "chapter", target: c.id, label: "Capítulo " + pad(currentNumber()) });
    openPanel("cloud");
  };
  return [
    { label: "Novo capítulo depois deste", hint: "Enter ×3", act: () => void newChapterAfterCurrent() },
    { label: "Notas do capítulo", hint: "Ctrl ;", act: () => openPanel("notes") },
    { label: state.focus ? "Sair do modo foco" : "Modo foco", hint: "Ctrl .", act: () => setState("focus", !state.focus) },
    { label: "Mudar status  (" + STATUS_LABEL[status] + ")", hint: "Alt S", act: cycleStatus },
    { label: "Capítulo anterior", hint: "Alt ↑", act: () => void goChapterStep(-1) },
    { label: "Próximo capítulo", hint: "Alt ↓", act: () => void goChapterStep(1) },
    { label: "Mover capítulo para cima", hint: "Alt Shift ↑", act: () => void moveChapterStep(-1) },
    { label: "Mover capítulo para baixo", hint: "Alt Shift ↓", act: () => void moveChapterStep(1) },
    { label: "Copiar capítulo para publicar", hint: "", act: () => void copyChapter() },
    { label: "Compartilhar capítulo", hint: "", act: share },
    ...(state.cloudBook?.enabled
      ? [
          { label: "Fazer backup agora", hint: "", act: () => void backupNow() },
          { label: "Buscar comentários", hint: "", act: () => void fetchComments(false) },
        ]
      : []),
    { label: "Meta diária: " + fmt(state.prefs.goal) + " palavras", hint: "", act: cycleGoal },
    { label: "Largura do texto: " + WIDTH_LABEL[state.prefs.width], hint: "", act: cycleWidth },
    { label: "Aumentar texto (" + state.prefs.textPx + " px)", hint: "Ctrl +", keep: true, act: textBigger },
    { label: "Diminuir texto (" + state.prefs.textPx + " px)", hint: "Ctrl −", keep: true, act: textSmaller },
    ...formatCommands(),
    ...bookSettingsCommands(),
  ];
}
