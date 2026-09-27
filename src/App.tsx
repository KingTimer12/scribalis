import { Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { BottomBar } from "./components/chrome/BottomBar";
import { TopBar } from "./components/chrome/TopBar";
import { Editor } from "./components/editor/Editor";
import { CoverFileInput } from "./components/library/CoverFileInput";
import { Library } from "./components/library/Library";
import { ChapterIndex } from "./components/panels/ChapterIndex";
import { CommandPalette } from "./components/panels/CommandPalette";
import { HelpPanel } from "./components/panels/HelpPanel";
import { NotesPanel } from "./components/panels/NotesPanel";
import { focusTarget } from "./store/focus";
import { rootKey } from "./store/keyboard";
import { usePersistence } from "./store/persistence";
import { state } from "./store/state";

export default function App() {
  usePersistence();

  onMount(() => {
    window.addEventListener("keydown", rootKey);
    focusTarget("lib");
  });
  onCleanup(() => window.removeEventListener("keydown", rootKey));

  const editor = () => state.view === "editor";

  return (
    <div
      class={`app ${state.prefs.theme} w${state.prefs.width} f${state.prefs.font}` + (state.focus && editor() ? " focus" : "")}
    >
      <CoverFileInput />
      <TopBar />
      <Show when={editor()} fallback={<Library />}>
        <Editor />
      </Show>
      <BottomBar />

      <Switch>
        <Match when={state.panel === "notes" && editor()}>
          <NotesPanel />
        </Match>
        <Match when={state.panel === "index" && editor()}>
          <ChapterIndex />
        </Match>
        <Match when={state.panel === "palette"}>
          <CommandPalette />
        </Match>
        <Match when={state.panel === "help"}>
          <HelpPanel />
        </Match>
      </Switch>
    </div>
  );
}
