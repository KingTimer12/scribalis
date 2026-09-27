import { Show } from "solid-js";
import { plural, wc } from "../../lib/format";
import { bookLabel, currentChapter, state } from "../../store/state";
import { openPanel } from "../../store/ui";
import { Hint } from "../ui/Hint";
import { GoalProgress } from "./GoalProgress";
import { StatusMessage } from "./StatusMessage";

export function BottomBar() {
  const editor = () => state.view === "editor";
  return (
    <footer class="chrome absolute inset-x-0 bottom-0 grid h-16 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center px-9">
      <div class="ui flex gap-3.5">
        <Show
          when={editor()}
          fallback={
            <>
              <Hint keys="←→↑↓">escolher</Hint>
              <Hint keys="Enter">abrir</Hint>
            </>
          }
        >
          <button
            class="ui crumb flex gap-3.5"
            onClick={() => openPanel("index")}
            title="Índice de capítulos (Ctrl E)"
          >
            <span>{plural(wc(currentChapter()?.body), "palavra", "palavras")}</span>
            <span class="opacity-50">·</span>
            <span>{bookLabel()}</span>
          </button>
        </Show>
      </div>

      <div class="ui flex justify-center">
        <StatusMessage />
      </div>

      <div class="ui flex items-center justify-end gap-3">
        <Show
          when={editor()}
          fallback={
            <>
              <Hint keys="N">nova</Hint>
              <Hint keys="C">capa</Hint>
              <Hint keys="R">renomear</Hint>
              <Hint keys="Del">excluir</Hint>
            </>
          }
        >
          <GoalProgress />
        </Show>
      </div>
    </footer>
  );
}
