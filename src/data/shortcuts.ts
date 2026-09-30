import { closePanel, openPanel } from "../store/actions/ui";
import { textBigger, textSmaller, textReset, toggleTheme } from "../store/actions/prefs";

export interface Shortcut {
  label: string;
  keys: string[];
  /**
   * Runs the action from the help panel (which then closes or switches away).
   * Left out for rows that only make sense in a focused widget (tree, editor
   * selection, library list): those stay text-only, shortcut-only rows.
   */
  run?: () => void;
}

/** Runs an action, then leaves the help panel (for actions that don't already switch to another panel). */
const runAndClose = (fn: () => void) => () => {
  fn();
  closePanel();
};

/** List shown in the help panel (Ctrl /). */
export const SHORTCUTS: Shortcut[] = [
  { label: "Novo capítulo (divide no cursor)", keys: ["Enter", "Enter", "Enter"] },
  { label: "Nova linha sem contar", keys: ["Shift", "Enter"] },
  { label: "Inserir separador (capítulo)", keys: ["Ctrl", "Enter"] },
  { label: "Inserir imagem (ou arraste para a página)", keys: ["Ctrl", "Shift", "I"] },
  { label: "Negrito", keys: ["Ctrl", "B"] },
  { label: "Itálico", keys: ["Ctrl", "I"] },
  { label: "Alinhar esquerda / centro / direita / justificado", keys: ["Ctrl", "Shift", "L E R J"] },
  { label: "Comandos e busca", keys: ["Ctrl", "K"], run: () => openPanel("palette") },
  { label: "Voltar às obras", keys: ["Ctrl", "O"] },
  { label: "Mostrar / recolher a árvore", keys: ["Ctrl", "E"] },
  { label: "Notas do capítulo ou texto", keys: ["Ctrl", ";"] },
  { label: "Capítulo anterior / próximo", keys: ["Alt", "↑ ↓"] },
  { label: "Mover capítulo na pasta", keys: ["Alt", "Shift", "↑ ↓"] },
  { label: "Mudar status", keys: ["Alt", "S"] },
  { label: "Árvore: novo capítulo (no Manuscrito) ou texto", keys: ["N"] },
  { label: "Árvore: nova pasta", keys: ["Shift", "N"] },
  { label: "Árvore: renomear", keys: ["F2"] },
  { label: "Árvore: excluir", keys: ["Del"] },
  { label: "Árvore: menu do item", keys: ["Shift", "F10"] },
  { label: "Modo foco", keys: ["Ctrl", "."] },
  { label: "Aumentar texto", keys: ["Ctrl", "+"], run: runAndClose(textBigger) },
  { label: "Diminuir texto", keys: ["Ctrl", "−"], run: runAndClose(textSmaller) },
  { label: "Texto no tamanho padrão", keys: ["Ctrl", "0"], run: runAndClose(textReset) },
  { label: "Tema claro / escuro", keys: ["Ctrl", "J"], run: runAndClose(toggleTheme) },
  { label: "Nuvem: backup e links", keys: ["Ctrl", "Shift", "S"], run: () => openPanel("cloud") },
  { label: "Ajustes (tema, texto, interface)", keys: ["Ctrl", ","], run: () => openPanel("settings") },
  { label: "Do título para o texto", keys: ["Enter"] },
  { label: "Obras: nova obra", keys: ["N"] },
  { label: "Obras: renomear", keys: ["R"] },
  { label: "Obras: capa (Shift remove)", keys: ["C"] },
  { label: "Obras: excluir", keys: ["Del"] },
  { label: "Obras: buscar", keys: ["/"] },
  { label: "Esta ajuda", keys: ["Ctrl", "/"] },
  { label: "Fechar e voltar", keys: ["Esc"], run: closePanel },
];
