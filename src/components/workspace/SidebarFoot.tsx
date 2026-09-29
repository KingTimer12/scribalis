import { toggleSidebar } from "../../store/actions/sidebar";

/** Bottom of the tree sidebar: the collapse button (and "+ Novo", Task 10). */
export function SidebarFoot() {
  return (
    <div class="ws-foot">
      <span />
      <button type="button" class="ui crumb" title="Recolher a árvore (Ctrl E)" aria-label="Recolher a árvore" onClick={toggleSidebar}>
        «
      </button>
    </div>
  );
}
