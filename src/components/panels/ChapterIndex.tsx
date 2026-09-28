import { createEffect, createSignal, For, on, Show } from "solid-js";
import { fmt, pad } from "../../lib/format";
import { deleteChapter, openFromIndex, requestChapterDelete, sendChapterToArea } from "../../store/actions/chapters";
import { focusRef, focusTarget } from "../../store/focus";
import { indexKey } from "../../store/keys/index";
import { bookLabel } from "../../store/selectors/book";
import { setState, state } from "../../store/state";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { StatusDot } from "../ui/StatusDot";

/** Drawer listing the book's chapters (Ctrl E). */
export function ChapterIndex() {
  let el!: HTMLDivElement;
  const [menu, setMenu] = createSignal<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const openMenu = (i: number, x: number, y: number) => {
    const c = state.book?.chapters[i];
    if (!c) return;
    const id = c.id;
    setState("indexSel", i);
    const armed = state.indexConfirm === id;
    setMenu({
      x,
      y,
      items: [
        { label: "Abrir", act: () => void openFromIndex(i) },
        { label: "Enviar para a área de trabalho", act: () => void sendChapterToArea(id) },
        armed
          ? { label: "Confirmar: excluir o capítulo " + pad(i + 1), danger: true, act: () => void deleteChapter(id) }
          : { label: "Excluir capítulo", danger: true, act: () => void requestChapterDelete(i) },
      ],
    });
  };

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
                classList={{ sel: i() === state.indexSel, cur: i() === state.book?.cur, confirm: c.id === state.indexConfirm }}
                onClick={() => openFromIndex(i())}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(i(), e.clientX, e.clientY);
                }}
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
          <Hint keys="Del">excluir</Hint>
          <Hint keys="Esc">fechar</Hint>
        </div>
      </div>
      <Show when={menu()}>
        {(m) => (
          <ContextMenu
            x={m().x}
            y={m().y}
            items={m().items}
            onClose={() => {
              setMenu(null);
              focusTarget("index");
            }}
          />
        )}
      </Show>
    </>
  );
}
