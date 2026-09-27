import { createEffect, For, on } from "solid-js";
import { fmt, pad, wc } from "../../lib/format";
import { indexKey, openFromIndex } from "../../store/chapters";
import { focusRef } from "../../store/focus";
import { bookLabel, currentBook, state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { StatusDot } from "../ui/StatusDot";

/** Gaveta com os capítulos da obra (Ctrl E). */
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
          <div class="text-xl font-medium">{currentBook()?.title || "Obra sem título"}</div>
          <div class="ui">{bookLabel()}</div>
        </div>
        <div class="flex grow flex-col gap-0.5 overflow-y-auto [scrollbar-width:none]">
          <For each={currentBook()?.chapters ?? []}>
            {(c, i) => (
              <button
                class="ix-item"
                classList={{ sel: i() === state.indexSel, cur: i() === currentBook()?.cur }}
                onClick={() => openFromIndex(i())}
              >
                <span class="ui">{pad(i() + 1)}</span>
                <span class="ix-t">{c.title || "Sem título"}</span>
                <span class="ui">{fmt(wc(c.body))}</span>
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
