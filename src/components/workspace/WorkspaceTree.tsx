import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { findNode, visibleRows } from "../../lib/tree";
import { focusRef, focusTarget } from "../../store/focus";
import { treeKey } from "../../store/keys/workspace";
import { state } from "../../store/state";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { rowId, TreeRow } from "./TreeRow";
import { selectForMenu, treeMenu } from "./treeMenu";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** The workspace tree: keyboard, mouse, drag and drop and a context menu. */
export function WorkspaceTree() {
  const rows = createMemo(() => visibleRows(state.area, new Set(state.areaExpanded)));
  const [menu, setMenu] = createSignal<MenuState | null>(null);

  const openMenu = (id: string | null, x: number, y: number) => {
    const node = id ? findNode(state.area, id) : null;
    selectForMenu(node);
    setMenu({ x, y, items: treeMenu(node) });
  };

  /** Keyboard access: the menu of the selected row, under it. */
  const openMenuAtSelection = () => {
    const id = state.areaSel;
    const el = id ? document.getElementById(rowId(id)) : null;
    const r = el?.getBoundingClientRect();
    openMenu(el ? id : null, r ? r.left + 24 : 24, r ? r.bottom : 96);
  };

  const closeMenu = () => {
    setMenu(null);
    focusTarget("tree");
  };

  createEffect(() => {
    const id = state.areaSel;
    if (id) document.getElementById(rowId(id))?.scrollIntoView({ block: "nearest" });
  });

  return (
    <>
      <div
        class="ws-tree"
        role="tree"
        aria-label="Área de trabalho"
        tabIndex={0}
        ref={focusRef("tree")}
        aria-activedescendant={state.areaSel && findNode(state.area, state.areaSel) ? rowId(state.areaSel) : undefined}
        onKeyDown={(e) => treeKey(e, openMenuAtSelection)}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu(null, e.clientX, e.clientY);
        }}
      >
        <For each={rows()}>{(r) => <TreeRow row={r} onMenu={(x, y) => openMenu(r.node.id, x, y)} />}</For>
        <Show when={rows().length === 0}>
          <p class="ws-tree-empty ui">Vazia. Aperte N para criar um documento.</p>
        </Show>
      </div>
      <Show when={menu()}>{(m) => <ContextMenu x={m().x} y={m().y} items={m().items} onClose={closeMenu} />}</Show>
    </>
  );
}
