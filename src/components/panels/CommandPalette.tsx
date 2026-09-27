import { createEffect, createMemo, For, on, Show } from "solid-js";
import { paletteItems, paletteKey, runCommand } from "../../store/commands";
import { focusRef } from "../../store/focus";
import { setState, state } from "../../store/state";
import { Kbd } from "../ui/Kbd";
import { Scrim } from "../ui/Scrim";
import { SrLabel } from "../ui/SrLabel";

/** Command palette (Ctrl K): searches commands, chapters and other books. */
export function CommandPalette() {
  let listEl!: HTMLDivElement;
  const items = createMemo(paletteItems);
  const sel = () => Math.min(state.pIdx, Math.max(0, items().length - 1));

  createEffect(
    on([sel, () => state.q], () => listEl.querySelector(".pal-item.sel")?.scrollIntoView({ block: "nearest" }), {
      defer: true,
    }),
  );

  return (
    <>
      <Scrim />
      <div class="pal">
        <SrLabel for="pal-in">Buscar comando</SrLabel>
        <input
          id="pal-in"
          class="pal-in"
          value={state.q}
          onInput={(e) => setState({ q: e.currentTarget.value, pIdx: 0, confirmDel: false })}
          onKeyDown={(e) => paletteKey(e, items())}
          ref={focusRef("palette")}
          placeholder={state.view === "library" ? "Comando ou obra…" : "Comando, capítulo ou obra…"}
          autocomplete="off"
        />
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
      </div>
    </>
  );
}
