export interface Shortcut {
  label: string;
  keys: string[];
}

/** List shown in the help panel (Ctrl /). */
export const SHORTCUTS: Shortcut[] = [
  { label: "Novo capítulo (divide no cursor)", keys: ["Enter", "Enter", "Enter"] },
  { label: "Nova linha sem contar", keys: ["Shift", "Enter"] },
  { label: "Inserir separador", keys: ["Ctrl", "Enter"] },
  { label: "Inserir imagem (ou arraste para a página)", keys: ["Ctrl", "Shift", "I"] },
  { label: "Negrito", keys: ["Ctrl", "B"] },
  { label: "Itálico", keys: ["Ctrl", "I"] },
  { label: "Alinhar esquerda / centro / direita / justificado", keys: ["Ctrl", "Shift", "L E R J"] },
  { label: "Comandos e busca", keys: ["Ctrl", "K"] },
  { label: "Voltar às obras", keys: ["Ctrl", "O"] },
  { label: "Capítulos / Área de trabalho", keys: ["Ctrl", "1 2"] },
  { label: "Índice de capítulos", keys: ["Ctrl", "E"] },
  { label: "Notas do capítulo", keys: ["Ctrl", ";"] },
  { label: "Capítulo anterior / próximo", keys: ["Alt", "↑ ↓"] },
  { label: "Mover capítulo", keys: ["Alt", "Shift", "↑ ↓"] },
  { label: "Índice: excluir capítulo", keys: ["Del", "Del"] },
  { label: "Mudar status", keys: ["Alt", "S"] },
  { label: "Modo foco", keys: ["Ctrl", "."] },
  { label: "Tema claro / escuro", keys: ["Ctrl", "J"] },
  { label: "Do título para o texto", keys: ["Enter"] },
  { label: "Obras: nova obra", keys: ["N"] },
  { label: "Obras: renomear", keys: ["R"] },
  { label: "Obras: capa (Shift remove)", keys: ["C"] },
  { label: "Obras: excluir", keys: ["Del", "Del"] },
  { label: "Obras: buscar", keys: ["/"] },
  { label: "Esta ajuda", keys: ["Ctrl", "/"] },
  { label: "Fechar e voltar", keys: ["Esc"] },
];
