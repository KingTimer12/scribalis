import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createEffect, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import { isTauri } from "./api/invoke";
import type { CloudStatus } from "./api/types";
import { BottomBar } from "./components/chrome/BottomBar";
import { TopBar } from "./components/chrome/TopBar";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { CloudPanel } from "./components/cloud/CloudPanel";
import { Library } from "./components/library/Library";
import { CommandPalette } from "./components/panels/CommandPalette";
import { HelpPanel } from "./components/panels/HelpPanel";
import { NotesPanel } from "./components/panels/NotesPanel";
import { SpacingPanel } from "./components/panels/SpacingPanel";
import { ScrivenerImport } from "./components/scrivener/ScrivenerImport";
import { Workspace } from "./components/workspace/Workspace";
import { TEXT_PX_DEFAULT, UI_SCALES } from "./lib/constants";
import { applyUiZoom } from "./lib/uiZoom";
import { applyCloudStatus, backupOnClose, loadCloud, syncCloudBadges } from "./store/actions/cloud";
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
          await backupOnClose();
        })
        .then(keep);
      void listenImageDrops().then(keep);
      void listen<CloudStatus>("cloud://status", (e) => applyCloudStatus(e.payload)).then(keep);
    }
    await Promise.all([loadPrefs(), refreshLibrary()]);
    await loadCloud();
    void syncCloudBadges();
    focusTarget("lib");
    if (isTauri) void checkForUpdate();
  });
  onCleanup(() => {
    disposed = true;
    unlisteners.forEach((u) => u());
    window.removeEventListener("keydown", rootKey);
    window.removeEventListener("beforeunload", onUnload);
  });

  const zoom = () => UI_SCALES[state.prefs.uiScale] ?? 1;
  createEffect(() => applyUiZoom(zoom()));
  // The chapter text is sized against the zoom so it stays at `textPx` on screen.
  const sizes = () => ({ "--text-scale": String(state.prefs.textPx / TEXT_PX_DEFAULT), "--ui-zoom": String(zoom()) });

  const inBook = () => state.view === "book" && !!state.book;
  /** A chapter or a free text is open: notes and paragraph spacing apply to it. */
  const writing = () => {
    const kind = openAreaNode()?.kind;
    return inBook() && (kind === "chapter" || kind === "text");
  };

  return (
    <div class={`app ${state.prefs.theme} w${state.prefs.width}` + (state.focus && inBook() ? " focus" : "")} style={sizes()}>
      <TopBar />
      <Show when={inBook()} fallback={<Library />}>
        <Workspace />
      </Show>
      <BottomBar />

      <Switch>
        <Match when={state.panel === "notes" && writing()}>
          <NotesPanel />
        </Match>
        <Match when={state.panel === "spacing" && writing()}>
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
      <ConfirmDialog />
    </div>
  );
}
