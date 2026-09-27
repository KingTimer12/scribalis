import { createEffect, For, on } from "solid-js";
import { fmt, pad } from "../../lib/format";
import { openFromIndex } from "../../store/actions/chapters";
import { focusRef } from "../../store/focus";
import { indexKey } from "../../store/keys/index";
import { bookLabel } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { StatusDot } from "../ui/StatusDot";

/** Drawer listing the book's chapters (Ctrl E). */
export function ChapterIndex() {
  let el!: HTMLDivElement;

  createEffect(
    on(
      () => state.indexSel,
      () => el.querySelector(".ix-item.sel")?.scrollIntoView({ block: "nearest" }),
    ),
  );

  return (
    <>
      <Scrim />
      <div
        class="drawer"
        tabIndex={-1}
        ref={(e) => {
          el = e;
          focusRef("index")(e);
        }}
        onKeyDown={indexKey}
      >
        <div class="flex flex-col gap-1.5 px-3">
          <div class="text-xl font-medium">{state.book?.title || "Obra sem título"}</div>
          <div class="ui">{bookLabel()}</div>
        </div>
        <div class="flex grow flex-col gap-0.5 overflow-y-auto [scrollbar-width:none]">
          <For each={state.book?.chapters ?? []}>
            {(c, i) => (
              <button
                class="ix-item"
                classList={{ sel: i() === state.indexSel, cur: i() === state.book?.cur }}
                onClick={() => openFromIndex(i())}
              >
                <span class="ui">{pad(i() + 1)}</span>
                <span class="ix-t">{c.title || "Sem título"}</span>
                <span class="ui">{fmt(i() === state.book?.cur ? state.liveWords : c.words)}</span>
                <StatusDot status={c.status} />
              </button>
            )}
          </For>
        </div>
        <div class="ui flex flex-wrap gap-x-3.5 gap-y-2.5 px-3 leading-snug">
          <Hint keys="↑↓">navegar</Hint>
          <Hint keys="Enter">abrir</Hint>
          <Hint keys="Alt ↑↓">mover</Hint>
          <Hint keys="Esc">fechar</Hint>
        </div>
      </div>
    </>
  );
}
