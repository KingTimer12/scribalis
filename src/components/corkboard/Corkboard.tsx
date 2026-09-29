import { createEffect, createSignal, For, Show } from "solid-js";
import type { AreaNode } from "../../api/types";
import { displayTitle } from "../../lib/manuscript";
import { focusRef, focusTarget } from "../../store/focus";
import { boardKey } from "../../store/keys/board";
import { state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { Hint } from "../ui/Hint";
import { selectForMenu, treeMenu } from "../workspace/treeMenu";
import { boardNewMenu } from "./boardMenu";
import { cardId, IndexCard } from "./IndexCard";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** Columns the grid laid out, as the browser computed them (1 when it cannot tell). */
function gridColumns(el: HTMLElement | undefined): number {
  if (!el) return 1;
  return getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}

/** A folder or the Manuscrito as index cards, one per child, in tree order. */
export function Corkboard(props: { folder: AreaNode }) {
  let grid: HTMLDivElement | undefined;
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const children = () => props.folder.children ?? [];
  const ids = () => children().map((c) => c.id);
  const selected = () => (state.areaSel && ids().includes(state.areaSel) ? state.areaSel : null);
  const title = () => displayTitle(state.area, props.folder);

  const openCardMenu = (node: AreaNode, x: number, y: number) => {
    selectForMenu(node);
    setMenu({ x, y, items: treeMenu(node) });
  };

  /** Keyboard access: the menu of the selected card, over it. */
  const openMenuAtSelection = () => {
    const node = children().find((c) => c.id === selected());
    if (!node) return;
    const r = document.getElementById(cardId(node.id))?.getBoundingClientRect();
    openCardMenu(node, r ? r.left + 24 : 24, r ? r.top + 32 : 96);
  };

  const openNewMenu = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom, items: boardNewMenu(props.folder) });
  };

  const closeMenu = () => {
    setMenu(null);
    focusTarget("board");
  };

  createEffect(() => {
    const id = selected();
    if (id) document.getElementById(cardId(id))?.scrollIntoView({ block: "nearest" });
  });

  return (
    <div class="board">
      <div class="board-head">
        <h2 class="board-title">{title()}</h2>
        <button type="button" class="sp-btn" aria-haspopup="menu" onClick={openNewMenu}>
          + Novo
        </button>
      </div>
      <Show when={children().length > 0} fallback={<p class="board-empty ui">Pasta vazia</p>}>
        <div
          ref={(el) => {
            grid = el;
            focusRef("board")(el);
          }}
          class="board-grid"
          role="listbox"
          aria-label={"Cartões de " + title()}
          tabIndex={0}
          aria-activedescendant={selected() ? cardId(selected()!) : undefined}
          onKeyDown={(e) => boardKey(e, ids(), gridColumns(grid), openMenuAtSelection)}
        >
          <For each={children()}>{(c) => <IndexCard node={c} onMenu={(x, y) => openCardMenu(c, x, y)} />}</For>
        </div>
        <div class="ws-help">
          <Hint keys="←↑↓→">escolher</Hint>
          <Hint keys="Enter">abrir</Hint>
          <Hint keys="Esc">voltar à árvore</Hint>
        </div>
      </Show>
      <Show when={menu()}>{(m) => <ContextMenu x={m().x} y={m().y} items={m().items} onClose={closeMenu} />}</Show>
    </div>
  );
}
