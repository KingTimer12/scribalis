import { getCurrentWindow } from "@tauri-apps/api/window";
import { Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { isTauri } from "./api/invoke";
import { BottomBar } from "./components/chrome/BottomBar";
import { TopBar } from "./components/chrome/TopBar";
import { Editor } from "./components/editor/Editor";
import { Library } from "./components/library/Library";
import { ChapterIndex } from "./components/panels/ChapterIndex";
import { CommandPalette } from "./components/panels/CommandPalette";
import { HelpPanel } from "./components/panels/HelpPanel";
import { NotesPanel } from "./components/panels/NotesPanel";
import { refreshLibrary } from "./store/actions/library";
import { loadPrefs } from "./store/actions/prefs";
import { focusTarget } from "./store/focus";
import { rootKey } from "./store/keys/global";
import { flushAll } from "./store/saving";
import { state } from "./store/state";

export default function App() {
  // Browser dev reloads only: Tauri may close the window without this event.
  const onUnload = () => void flushAll();
  let unlistenClose: (() => void) | undefined;
  let disposed = false;

  onMount(async () => {
    window.addEventListener("keydown", rootKey);
    window.addEventListener("beforeunload", onUnload);
    if (isTauri) {
      // The window is destroyed only after this handler resolves, so pending saves land.
      void getCurrentWindow()
        .onCloseRequested(async () => {
          // Never throw here: a rejected handler would keep the window from closing.
          await flushAll().catch(() => {});
        })
        .then((unlisten) => (disposed ? unlisten() : (unlistenClose = unlisten)));
    }
    await Promise.all([loadPrefs(), refreshLibrary()]);
    focusTarget("lib");
  });
  onCleanup(() => {
    disposed = true;
    unlistenClose?.();
    window.removeEventListener("keydown", rootKey);
    window.removeEventListener("beforeunload", onUnload);
  });

  const editor = () => state.view === "editor" && !!state.book;

  return (
    <div class={`app ${state.prefs.theme} w${state.prefs.width} f${state.prefs.font}` + (state.focus && editor() ? " focus" : "")}>
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
