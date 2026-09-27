export interface Shortcut {
  label: string;
  keys: string[];
}

/** Lista exibida no painel de ajuda (Ctrl /). */
export const SHORTCUTS: Shortcut[] = [
  { label: "Novo capítulo (divide no cursor)", keys: ["Enter", "Enter", "Enter"] },
  { label: "Nova linha sem contar", keys: ["Shift", "Enter"] },
  { label: "Comandos e busca", keys: ["Ctrl", "K"] },
  { label: "Voltar às obras", keys: ["Ctrl", "O"] },
  { label: "Índice de capítulos", keys: ["Ctrl", "E"] },
  { label: "Notas do capítulo", keys: ["Ctrl", ";"] },
  { label: "Capítulo anterior / próximo", keys: ["Alt", "↑ ↓"] },
  { label: "Mover capítulo", keys: ["Alt", "Shift", "↑ ↓"] },
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
