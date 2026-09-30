import { createSignal, Show } from "solid-js";
import { plural } from "../../lib/format";
import { restoreSamples, startNew } from "../../store/actions/library";
import { startScrivenerImport } from "../../store/actions/scrivener";
import { focusRef } from "../../store/focus";
import { libQKey } from "../../store/keys/library";
import { setState, state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { IconMore } from "../ui/icons";
import { Kbd } from "../ui/Kbd";
import { SrLabel } from "../ui/SrLabel";

/** "⋯" at the header: actions too rare for their own button. */
function overflowMenu(): MenuItem[] {
  return [{ label: "Restaurar obras de exemplo", act: () => void restoreSamples() }];
}

export function LibraryHeader() {
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);
  const stats = () =>
    plural(state.library.length, "obra", "obras") +
    " · " +
    plural(state.library.reduce((a, b) => a + b.words, 0), "palavra escrita", "palavras escritas");

  return (
    <div class="flex items-end justify-between gap-8">
      <div class="flex flex-col gap-2.5">
        <div class="ui cap">Biblioteca</div>
        <h1 class="m-0 text-[46px] font-medium tracking-[-.015em]">Suas obras</h1>
        <div class="ui">{stats()}</div>
      </div>
      <div class="flex items-end gap-6">
        <div class="mb-2 flex items-center gap-2">
          <button type="button" class="sp-btn primary" title="Nova obra (N)" onClick={startNew}>
            + Nova obra
          </button>
          <button type="button" class="sp-btn" onClick={() => void startScrivenerImport({ type: "new" })}>
            Importar do Scrivener…
          </button>
          <button
            type="button"
            class="icon-btn"
            aria-label="Mais ações da biblioteca"
            title="Mais ações"
            aria-haspopup="menu"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 4 });
            }}
          >
            <IconMore size={14} />
          </button>
        </div>
        <div class="flex w-[300px] items-center gap-3 border-b border-faint pb-3">
          <Kbd>/</Kbd>
          <SrLabel for="lib-q">Buscar obra</SrLabel>
          <input
            id="lib-q"
            class="lib-q"
            value={state.libQ}
            onInput={(e) => setState({ libQ: e.currentTarget.value, libSel: 0 })}
            onKeyDown={libQKey}
            ref={focusRef("libq")}
            placeholder="Buscar obra"
            autocomplete="off"
          />
        </div>
      </div>
      <Show when={menu()}>
        {(m) => <ContextMenu x={m().x} y={m().y} items={overflowMenu()} onClose={() => setMenu(null)} />}
      </Show>
    </div>
  );
}
