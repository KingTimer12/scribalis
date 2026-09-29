import { createSignal, Show } from "solid-js";
import { toggleSidebar } from "../../store/actions/sidebar";
import { focusTarget } from "../../store/focus";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { newMenu } from "./treeMenu";

/** Bottom of the tree sidebar: "+ Novo" (options follow the selection) and the collapse button. */
export function SidebarFoot() {
  const [menu, setMenu] = createSignal<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const open = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.top, items: newMenu() });
  };
  return (
    <div class="ws-foot">
      <button type="button" class="ui crumb" aria-haspopup="menu" title="Criar na pasta selecionada" onClick={open}>
        + Novo
      </button>
      <button type="button" class="ui crumb" title="Recolher a árvore (Ctrl E)" aria-label="Recolher a árvore" onClick={toggleSidebar}>
        «
      </button>
      <Show when={menu()}>
        {(m) => (
          <ContextMenu
            x={m().x}
            y={m().y}
            items={m().items}
            onClose={() => {
              setMenu(null);
              focusTarget("tree");
            }}
          />
        )}
      </Show>
    </div>
  );
}
