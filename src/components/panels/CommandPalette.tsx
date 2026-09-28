import { createEffect, createMemo, For, on, onCleanup, Show } from "solid-js";
import { searchChapters } from "../../api/chapter";
import { paletteItems, runCommand } from "../../store/commands/palette";
import { focusRef } from "../../store/focus";
import { paletteKey } from "../../store/keys/palette";
import { setState, state } from "../../store/state";
import { Kbd } from "../ui/Kbd";
import { Scrim } from "../ui/Scrim";
import { SrLabel } from "../ui/SrLabel";

const SEARCH_DELAY = 150;

/** Command palette (Ctrl K): searches commands, chapters and other books. */
export function CommandPalette() {
  let listEl!: HTMLDivElement;
  const items = createMemo(paletteItems);
  const sel = () => Math.min(state.pIdx, Math.max(0, items().length - 1));

  // Chapter text search runs in Rust, debounced.
  createEffect(
    on(
      () => state.q,
      (q) => {
        const book = state.book;
        if (!q.trim() || !book || state.view !== "editor") return setState("hits", []);
        const timer = setTimeout(() => {
          searchChapters(book.id, q).then((hits) => state.q === q && setState("hits", hits)).catch(() => setState("hits", []));
        }, SEARCH_DELAY);
        onCleanup(() => clearTimeout(timer));
      },
    ),
  );

  createEffect(
    on([sel, () => state.q], () => listEl?.querySelector(".pal-item.sel")?.scrollIntoView({ block: "nearest" }), { defer: true }),
  );

  const value = () => (state.prompt ? state.prompt.value : state.q);
  const onInput = (v: string) =>
    state.prompt ? setState("prompt", "value", v) : setState({ q: v, pIdx: 0, confirmDel: false });

  return (
    <>
      <Scrim />
      <div class="pal">
        <SrLabel for="pal-in">{state.prompt ? state.prompt.label : "Buscar comando"}</SrLabel>
        <input
          id="pal-in"
          class="pal-in"
          value={value()}
          onInput={(e) => onInput(e.currentTarget.value)}
          onKeyDown={(e) => paletteKey(e, items())}
          ref={focusRef("palette")}
          placeholder={state.prompt ? state.prompt.label + "…" : state.view !== "editor" ? "Comando ou obra…" : "Comando, capítulo ou obra…"}
          autocomplete="off"
        />
        <Show
          when={!state.prompt}
          fallback={<div class="ui p-3.5">{state.prompt!.label} · Enter confirma · Esc cancela</div>}
        >
          <div class="pal-list" ref={listEl}>
            <For each={items()}>
              {(it, i) => (
                <button
                  class="pal-item"
                  classList={{ sel: i() === sel(), danger: !!it.danger }}
                  onClick={() => runCommand(it)}
                  onMouseEnter={() => state.pIdx !== i() && setState("pIdx", i())}
                >
                  <span>
                    <span class="pal-kind">{it.kind}</span>
                    {it.label}
                  </span>
                  <Show when={it.hint}>
                    <Kbd>{it.hint}</Kbd>
                  </Show>
                </button>
              )}
            </For>
            <Show when={items().length === 0}>
              <div class="ui p-3.5">Nada encontrado.</div>
            </Show>
          </div>
        </Show>
      </div>
    </>
  );
}
