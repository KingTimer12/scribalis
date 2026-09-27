import { allWords, plural } from "../../lib/format";
import { focusRef } from "../../store/focus";
import { libQKey } from "../../store/library";
import { setState, state } from "../../store/state";
import { Kbd } from "../ui/Kbd";
import { SrLabel } from "../ui/SrLabel";

export function LibraryHeader() {
  const stats = () =>
    plural(state.books.length, "obra", "obras") +
    " · " +
    plural(allWords(state.books), "palavra escrita", "palavras escritas");

  return (
    <div class="flex items-end justify-between gap-8">
      <div class="flex flex-col gap-2.5">
        <div class="ui cap">Biblioteca</div>
        <h1 class="m-0 text-[46px] font-medium tracking-[-.015em]">Suas obras</h1>
        <div class="ui">{stats()}</div>
      </div>
      <div class="flex w-[300px] items-center gap-3 border-b border-faint pb-3">
        <Kbd>/</Kbd>
        <SrLabel for="lib-q">Buscar obra</SrLabel>
        <input
          id="lib-q"
          class="lib-q"
          value={state.libQ}
          onInput={(e) => setState({ libQ: e.currentTarget.value, libSel: 0, libConfirm: null })}
          onKeyDown={libQKey}
          ref={focusRef("libq")}
          placeholder="Buscar obra"
          autocomplete="off"
        />
      </div>
    </div>
  );
}
