export interface Shortcut {
  label: string;
  keys: string[];
}

/** List shown in the help panel (Ctrl /). */
export const SHORTCUTS: Shortcut[] = [
  { label: "Novo capítulo (divide no cursor)", keys: ["Enter", "Enter", "Enter"] },
  { label: "Nova linha sem contar", keys: ["Shift", "Enter"] },
  { label: "Inserir separador (capítulo)", keys: ["Ctrl", "Enter"] },
  { label: "Inserir imagem (ou arraste para a página)", keys: ["Ctrl", "Shift", "I"] },
  { label: "Negrito", keys: ["Ctrl", "B"] },
  { label: "Itálico", keys: ["Ctrl", "I"] },
  { label: "Alinhar esquerda / centro / direita / justificado", keys: ["Ctrl", "Shift", "L E R J"] },
  { label: "Comandos e busca", keys: ["Ctrl", "K"] },
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
  { label: "Tema claro / escuro", keys: ["Ctrl", "J"] },
  { label: "Nuvem: backup e links", keys: ["Ctrl", "Shift", "S"] },
  { label: "Do título para o texto", keys: ["Enter"] },
  { label: "Obras: nova obra", keys: ["N"] },
  { label: "Obras: renomear", keys: ["R"] },
  { label: "Obras: capa (Shift remove)", keys: ["C"] },
  { label: "Obras: excluir", keys: ["Del"] },
  { label: "Obras: buscar", keys: ["/"] },
  { label: "Esta ajuda", keys: ["Ctrl", "/"] },
  { label: "Fechar e voltar", keys: ["Esc"] },
];
