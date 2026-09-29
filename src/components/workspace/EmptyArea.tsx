import { startScrivenerImport } from "../../store/actions/scrivener";
import { addFiles, createNode } from "../../store/actions/workspace";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";

/** Shown when nothing (or a folder) is open: the ways to start filling the tree. */
export function EmptyArea() {
  return (
    <div class="ws-empty">
      <div class="ws-empty-title">Nada aberto</div>
      <p class="ws-empty-text">Escolha um capítulo ou um documento na árvore, ou crie um novo.</p>
      <div class="ws-actions">
        <button type="button" class="sp-btn" onClick={() => void createNode("text")}>
          Novo documento
        </button>
        <button type="button" class="sp-btn" onClick={() => void createNode("folder")}>
          Nova pasta
        </button>
        <button type="button" class="sp-btn" onClick={() => void addFiles()}>
          Adicionar arquivos
        </button>
        <button
          type="button"
          class="sp-btn"
          onClick={() => state.book && void startScrivenerImport({ type: "book", id: state.book.id })}
        >
          Importar do Scrivener
        </button>
      </div>
      <div class="ws-help">
        <Hint keys="↑↓">escolher</Hint>
        <Hint keys="Enter">abrir</Hint>
        <Hint keys="N">documento</Hint>
        <Hint keys="Shift N">pasta</Hint>
        <Hint keys="F2">renomear</Hint>
        <Hint keys="Del">excluir</Hint>
      </div>
    </div>
  );
}
