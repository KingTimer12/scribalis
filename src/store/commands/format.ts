import { clearParagraphFormat, setAlign, toggleBold, toggleItalic } from "../../editor/format";
import { openPanel } from "../actions/ui";
import type { Command } from "./palette";

/** Formatting commands for the palette; only meaningful while a chapter is open. */
export function formatCommands(): Command[] {
  return [
    { label: "Negrito", hint: "Ctrl B", act: toggleBold },
    { label: "Itálico", hint: "Ctrl I", act: toggleItalic },
    { label: "Alinhar à esquerda", hint: "Ctrl Shift L", act: () => setAlign("left") },
    { label: "Centralizar", hint: "Ctrl Shift E", act: () => setAlign("center") },
    { label: "Alinhar à direita", hint: "Ctrl Shift R", act: () => setAlign("right") },
    { label: "Justificar", hint: "Ctrl Shift J", act: () => setAlign("justify") },
    { label: "Espaçamento do parágrafo…", hint: "", act: () => openPanel("spacing") },
    { label: "Limpar formatação do parágrafo", hint: "", act: clearParagraphFormat },
  ];
}
