import { createEffect, createSignal, For, on, Show } from "solid-js";
import type { AreaNode } from "../../api/types";
import { displayTitle } from "../../lib/manuscript";
import { createCard, loadExcerpts } from "../../store/actions/board";
import { updatePrefs } from "../../store/actions/prefs";
import { focusRef } from "../../store/focus";
import { boardKey } from "../../store/keys/board";
import { state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { Hint } from "../ui/Hint";
import { BoardCard, cardDomId, cardTextId, cardTitleId } from "./BoardCard";
import { backgroundMenu, cardMenu, newCardLabel } from "./boardMenu";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

const SIZES = ["P", "M", "G"] as const;

/** Columns the grid laid out, as the browser computed them (1 when it cannot tell). */
function gridColumns(el: HTMLElement | undefined): number {
  if (!el) return 1;
  return getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}

const focusField = (domId: string) => requestAnimationFrame(() => document.getElementById(domId)?.focus());

/** Board of a folder (or of a document with subdocuments): its children as index cards, in tree order. */
export function BoardView(props: { parent: AreaNode }) {
  let grid: HTMLDivElement | undefined;
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const children = () => props.parent.children ?? [];
  const ids = () => children().map((c) => c.id);
  const editText = (id: string) => focusField(cardTextId(id));
  const add = () => void createCard(props.parent.id);

  // Placeholders follow the cards on show: a new, moved in or removed document reloads them.
  createEffect(on(() => props.parent.id + ":" + ids().join(","), () => void loadExcerpts(props.parent.id)));

  // A new card opens on its title.
  let known = new Set(ids());
  createEffect(() => {
    const now = ids();
    const fresh = now.find((id) => !known.has(id));
    known = new Set(now);
    if (fresh && state.boardSel === fresh) focusField(cardTitleId(fresh));
  });

  createEffect(() => {
    const id = state.boardSel;
    if (id) document.getElementById(cardDomId(id))?.scrollIntoView({ block: "nearest" });
  });

  const openMenuAtSelection = () => {
    const node = children().find((c) => c.id === state.boardSel);
    const r = node ? document.getElementById(cardDomId(node.id))?.getBoundingClientRect() : null;
    if (node && r) setMenu({ x: r.left + 24, y: r.top + 32, items: cardMenu(props.parent, node) });
  };

  return (
    <div class="board" data-size={state.prefs.cardSize}>
      <div class="board-head">
        <h2 class="board-title">{displayTitle(state.area, props.parent)}</h2>
        <button type="button" class="sp-btn" onClick={add}>
          + {newCardLabel(props.parent.id)}
        </button>
        <div class="board-size" role="group" aria-label="Tamanho">
          <span class="ui">Tamanho</span>
          <For each={SIZES}>
            {(label, i) => (
              <button
                type="button"
                class="ui crumb"
                classList={{ on: state.prefs.cardSize === i() }}
                aria-pressed={state.prefs.cardSize === i()}
                onClick={() => updatePrefs({ cardSize: i() as 0 | 1 | 2 })}
              >
                {label}
              </button>
            )}
          </For>
        </div>
      </div>
      <div
        ref={(el) => {
          grid = el;
          focusRef("board")(el);
        }}
        class="board-cork"
        role="listbox"
        aria-label={"Cartões de " + displayTitle(state.area, props.parent)}
        tabIndex={0}
        aria-activedescendant={state.boardSel ? cardDomId(state.boardSel) : undefined}
        onKeyDown={(e) => boardKey(e, ids(), gridColumns(grid), editText, openMenuAtSelection)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, items: backgroundMenu(props.parent) });
        }}
      >
        <Show when={ids().length > 0} fallback={<EmptyBoard onAdd={add} label={newCardLabel(props.parent.id)} />}>
          {/* Keyed by id: a fresh tree from Rust keeps the cards (and a focused field) mounted. */}
          <For each={ids()}>
            {(id) => {
              const node = () => children().find((c) => c.id === id);
              return (
                <Show when={node()}>
                  {(n) => (
                    <BoardCard
                      parent={props.parent.id}
                      node={n()}
                      onEditText={editText}
                      onMenu={(x, y) => setMenu({ x, y, items: cardMenu(props.parent, n()) })}
                    />
                  )}
                </Show>
              );
            }}
          </For>
        </Show>
      </div>
      <div class="ws-help">
        <Hint keys="←↑↓→">escolher</Hint>
        <Hint keys="Enter">sinopse</Hint>
        <Hint keys="Duplo clique">abrir</Hint>
        <Hint keys="Esc">voltar à árvore</Hint>
      </div>
      <Show when={menu()}>
        {(m) => <ContextMenu x={m().x} y={m().y} items={m().items} onClose={() => setMenu(null)} />}
      </Show>
    </div>
  );
}

function EmptyBoard(props: { onAdd: () => void; label: string }) {
  return (
    <div class="board-empty">
      <p class="ui">Nada aqui ainda.</p>
      <button type="button" class="sp-btn" onClick={() => props.onAdd()}>
        {props.label}
      </button>
    </div>
  );
}
