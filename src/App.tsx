import { getCurrentWindow } from "@tauri-apps/api/window";
import { Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { isTauri } from "./api/invoke";
import { BottomBar } from "./components/chrome/BottomBar";
import { TopBar } from "./components/chrome/TopBar";
import { CloudPanel } from "./components/cloud/CloudPanel";
import { Editor } from "./components/editor/Editor";
import { Library } from "./components/library/Library";
import { ChapterIndex } from "./components/panels/ChapterIndex";
import { CommandPalette } from "./components/panels/CommandPalette";
import { HelpPanel } from "./components/panels/HelpPanel";
import { NotesPanel } from "./components/panels/NotesPanel";
import { SpacingPanel } from "./components/panels/SpacingPanel";
import { ScrivenerImport } from "./components/scrivener/ScrivenerImport";
import { Workspace } from "./components/workspace/Workspace";
import { refreshLibrary } from "./store/actions/library";
import { loadPrefs } from "./store/actions/prefs";
import { checkForUpdate } from "./store/actions/update";
import { focusTarget } from "./store/focus";
import { listenImageDrops } from "./store/imageDrops";
import { rootKey } from "./store/keys/global";
import { flushAll } from "./store/saving";
import { openAreaNode } from "./store/selectors/workspace";
import { state } from "./store/state";

export default function App() {
  // Browser dev reloads only: Tauri may close the window without this event.
  const onUnload = () => void flushAll();
  const unlisteners: (() => void)[] = [];
  let disposed = false;
  const keep = (unlisten: () => void) => (disposed ? unlisten() : unlisteners.push(unlisten));

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
        .then(keep);
      void listenImageDrops().then(keep);
    }
    await Promise.all([loadPrefs(), refreshLibrary()]);
    focusTarget("lib");
    if (isTauri) void checkForUpdate();
  });
  onCleanup(() => {
    disposed = true;
    unlisteners.forEach((u) => u());
    window.removeEventListener("keydown", rootKey);
    window.removeEventListener("beforeunload", onUnload);
  });

  const editor = () => state.view === "editor" && !!state.book;
  const workspace = () => state.view === "workspace" && !!state.book;
  /** A text open in the workspace: the formatting panels apply to it too. */
  const areaText = () => workspace() && openAreaNode()?.kind === "text";

  return (
    <div class={`app ${state.prefs.theme} w${state.prefs.width} f${state.prefs.font}` + (state.focus && editor() ? " focus" : "")}>
      <TopBar />
      <Switch fallback={<Library />}>
        <Match when={editor()}>
          <Editor />
        </Match>
        <Match when={workspace()}>
          <Workspace />
        </Match>
      </Switch>
      <BottomBar />

      <Switch>
        <Match when={state.panel === "notes" && editor()}>
          <NotesPanel />
        </Match>
        <Match when={state.panel === "index" && editor()}>
          <ChapterIndex />
        </Match>
        <Match when={state.panel === "spacing" && (editor() || areaText())}>
          <SpacingPanel />
        </Match>
        <Match when={state.panel === "palette"}>
          <CommandPalette />
        </Match>
        <Match when={state.panel === "help"}>
          <HelpPanel />
        </Match>
        <Match when={state.panel === "cloud"}>
          <CloudPanel />
        </Match>
      </Switch>
      <Show when={state.scrivener}>
        <ScrivenerImport />
      </Show>
    </div>
  );
}
