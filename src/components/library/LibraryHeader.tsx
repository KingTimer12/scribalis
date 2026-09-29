import { plural } from "../../lib/format";
import { startScrivenerImport } from "../../store/actions/scrivener";
import { focusRef } from "../../store/focus";
import { libQKey } from "../../store/keys/library";
import { setState, state } from "../../store/state";
import { Kbd } from "../ui/Kbd";
import { SrLabel } from "../ui/SrLabel";

export function LibraryHeader() {
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
        <button type="button" class="sp-btn mb-2" onClick={() => void startScrivenerImport({ type: "new" })}>
          Importar do Scrivener
        </button>
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
    </div>
  );
}
