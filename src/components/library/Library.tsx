import { createEffect, For, on, Show } from "solid-js";
import { focusRef } from "../../store/focus";
import { libKey } from "../../store/library";
import { libList, libSelIndex, state } from "../../store/state";
import { Kbd } from "../ui/Kbd";
import { BookTile } from "./BookTile";
import { LibraryHeader } from "./LibraryHeader";
import { NewBookTile } from "./NewBookTile";

/** Tela "Suas obras": grade de capas navegável pelo teclado. */
export function Library() {
  let el!: HTMLDivElement;
  const list = () => libList();
  const sel = () => libSelIndex(list());

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
          <div class="grid grid-cols-6 gap-x-8 gap-y-11">
            <Show when={state.renaming === "new"}>
              <NewBookTile />
            </Show>
            <For each={list()}>
              {(book, i) => <BookTile book={book} selected={i() === sel() && !state.renaming} />}
            </For>
          </div>
          <Show when={list().length === 0 && state.renaming !== "new"}>
            <div class="flex flex-col gap-3 py-6">
              <div class="text-xl italic">{state.libQ ? "Nenhuma obra com esse nome." : "Nenhuma obra ainda."}</div>
              <div class="ui hint">
                Aperte <Kbd>N</Kbd> para começar uma obra nova.
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
