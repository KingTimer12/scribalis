/** Warning that a node's file is gone from disk (Rust flags the node `missing`). */
export function MissingIcon() {
  return (
    <svg class="ws-warn" viewBox="0 0 14 14" role="img" aria-label="Arquivo não encontrado">
      <title>Arquivo não encontrado</title>
      <path d="M7 1.8l5.5 9.7h-11z" />
      <path d="M7 5.6v2.6M7 9.9v.1" />
    </svg>
  );
}
