import { createEffect, createSignal, For, on, Show } from "solid-js";
import { startNew } from "../../store/actions/library";
import { startScrivenerImport } from "../../store/actions/scrivener";
import { focusRef } from "../../store/focus";
import { libKey } from "../../store/keys/library";
import { libList, libSelIndex } from "../../store/selectors/library";
import { state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { bookMenu } from "./bookMenu";
import { BookTile } from "./BookTile";
import { LibraryHeader } from "./LibraryHeader";
import { NewBookTile } from "./NewBookTile";

interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

/** "Suas obras" screen: keyboard-navigable cover grid. */
export function Library() {
  let el!: HTMLDivElement;
  const list = () => libList();
  const sel = () => libSelIndex(list());
  const [menu, setMenu] = createSignal<MenuState | null>(null);

  createEffect(
    on(sel, () => el.querySelector(".tile.sel")?.scrollIntoView({ block: "nearest" }), { defer: true }),
  );

  return (
    <div
      class="lib absolute inset-x-0 top-16 bottom-16 flex justify-center"
      tabIndex={-1}
      ref={(e) => {
        el = e;
        focusRef("lib")(e);
      }}
      onKeyDown={(e) => libKey(e, el)}
    >
      <div class="flex h-full w-[1120px] max-w-[calc(100%_-_72px)] flex-col gap-10 pt-12">
        <LibraryHeader />
        <div class="-mx-3 grow overflow-y-auto px-3 pt-3 pb-12 [scrollbar-width:none]">
          <Show when={state.ready} fallback={<div class="ui py-6">Abrindo biblioteca…</div>}>
            <div class="grid grid-cols-6 gap-x-8 gap-y-11">
              <Show when={state.renaming === "new"}>
                <NewBookTile />
              </Show>
              <For each={list()}>
                {(book, i) => (
                  <BookTile
                    book={book}
                    selected={i() === sel() && !state.renaming}
                    onMenu={(x, y) => setMenu({ x, y, items: bookMenu(book) })}
                  />
                )}
              </For>
            </div>
            <Show when={list().length === 0 && state.renaming !== "new"}>
              <div class="flex flex-col gap-3 py-6">
                <div class="text-xl italic">{state.libQ ? "Nenhuma obra com esse nome." : "Nenhuma obra ainda."}</div>
                <div class="flex gap-2">
                  <button type="button" class="sp-btn primary" onClick={startNew}>+ Nova obra</button>
                  <button type="button" class="sp-btn" onClick={() => void startScrivenerImport({ type: "new" })}>
                    Importar do Scrivener…
                  </button>
                </div>
              </div>
            </Show>
          </Show>
        </div>
      </div>
      <Show when={menu()}>{(m) => <ContextMenu x={m().x} y={m().y} items={m().items} onClose={() => setMenu(null)} />}</Show>
    </div>
  );
}
