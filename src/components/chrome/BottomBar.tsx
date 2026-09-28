import { Match, Show, Switch } from "solid-js";
import { plural } from "../../lib/format";
import { openPanel } from "../../store/actions/ui";
import { bookLabel } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { CloudIndicator } from "./CloudIndicator";
import { GoalProgress } from "./GoalProgress";
import { StatusMessage } from "./StatusMessage";

export function BottomBar() {
  const library = () => state.view === "library";
  return (
    <footer class="chrome absolute inset-x-0 bottom-0 grid h-16 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center px-9">
      <div class="ui flex gap-3.5">
        <Switch>
          <Match when={library()}>
            <Hint keys="←→↑↓">escolher</Hint>
            <Hint keys="Enter">abrir</Hint>
          </Match>
          <Match when={state.view === "editor"}>
            <button
              class="ui crumb flex gap-3.5"
              onClick={() => openPanel("index")}
              title="Índice de capítulos (Ctrl E)"
            >
              <span>{plural(state.liveWords, "palavra", "palavras")}</span>
              <span class="opacity-50">·</span>
              <span>{bookLabel()}</span>
            </button>
          </Match>
          <Match when={state.view === "workspace"}>
            <span>{bookLabel()}</span>
            <Hint keys="Ctrl 1">capítulos</Hint>
          </Match>
        </Switch>
      </div>

      <div class="ui flex justify-center">
        <StatusMessage />
      </div>

      <div class="ui flex items-center justify-end gap-3">
        <Show
          when={!library()}
          fallback={
            <>
              <Hint keys="N">nova</Hint>
              <Hint keys="C">capa</Hint>
              <Hint keys="R">renomear</Hint>
              <Hint keys="Del">excluir</Hint>
            </>
          }
        >
          <CloudIndicator />
          <GoalProgress />
        </Show>
      </div>
    </footer>
  );
}
