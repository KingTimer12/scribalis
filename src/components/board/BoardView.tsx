import { createEffect, createSignal, For, Show } from "solid-js";
import { createCard } from "../../store/actions/board";
import { updatePrefs } from "../../store/actions/prefs";
import { focusRef } from "../../store/focus";
import { boardKey } from "../../store/keys/board";
import { state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { Hint } from "../ui/Hint";
import { BoardCard, cardDomId, cardTextId, cardTitleId } from "./BoardCard";
import { backgroundMenu, cardMenu } from "./boardMenu";

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

/** The book's board: free cards on cork, in the saved order. */
export function BoardView() {
  let grid: HTMLDivElement | undefined;
  const [menu, setMenu] = createSignal<MenuState | null>(null);
  const ids = () => state.board.map((c) => c.id);
  const editText = (id: string) => focusField(cardTextId(id));

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
    const id = state.boardSel;
    const r = id ? document.getElementById(cardDomId(id))?.getBoundingClientRect() : null;
    if (id && r) setMenu({ x: r.left + 24, y: r.top + 32, items: cardMenu(id) });
  };

  return (
    <div class="board" data-size={state.prefs.cardSize}>
      <div class="board-head">
        <button type="button" class="sp-btn" onClick={() => void createCard()}>
          + Novo cartão
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
        aria-label="Cartões do quadro"
        tabIndex={0}
        aria-activedescendant={state.boardSel ? cardDomId(state.boardSel) : undefined}
        onKeyDown={(e) => boardKey(e, ids(), gridColumns(grid), editText, openMenuAtSelection)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, items: backgroundMenu() });
        }}
      >
        <Show when={state.board.length > 0} fallback={<EmptyBoard />}>
          {/* Keyed by id: a fresh list from Rust keeps the cards (and a focused field) mounted. */}
          <For each={ids()}>
            {(id) => {
              const card = () => state.board.find((c) => c.id === id);
              return (
                <Show when={card()}>
                  {(c) => (
                    <BoardCard
                      card={c()}
                      onEditText={editText}
                      onMenu={(x, y) => setMenu({ x, y, items: cardMenu(id) })}
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
        <Hint keys="Enter">escrever</Hint>
        <Hint keys="Esc">voltar à árvore</Hint>
      </div>
      <Show when={menu()}>
        {(m) => (
          <ContextMenu x={m().x} y={m().y} items={m().items} onClose={() => setMenu(null)} />
        )}
      </Show>
    </div>
  );
}

function EmptyBoard() {
  return (
    <div class="board-empty">
      <p class="ui">Nenhum cartão ainda.</p>
      <button type="button" class="sp-btn" onClick={() => void createCard()}>
        Novo cartão
      </button>
    </div>
  );
}
