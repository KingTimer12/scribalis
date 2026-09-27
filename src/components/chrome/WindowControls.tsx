import { getCurrentWindow } from "@tauri-apps/api/window";
import { createSignal, onCleanup, onMount } from "solid-js";

/** Minimize / maximize / close for the undecorated desktop window. */
export function WindowControls() {
  const win = getCurrentWindow();
  const [maximized, setMaximized] = createSignal(false);

  onMount(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const sync = () => void win.isMaximized().then(setMaximized);
    sync();
    void win.onResized(sync).then((u) => (disposed ? u() : (unlisten = u)));
    onCleanup(() => {
      disposed = true;
      unlisten?.();
    });
  });

  return (
    <div class="flex items-center gap-1">
      <button class="win-btn" onClick={() => void win.minimize()} title="Minimizar" aria-label="Minimizar">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5.5h8" />
        </svg>
      </button>
      <button
        class="win-btn"
        onClick={() => void win.toggleMaximize()}
        title={maximized() ? "Restaurar" : "Maximizar"}
        aria-label={maximized() ? "Restaurar" : "Maximizar"}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          {maximized() ? (
            <path d="M1.5 3.5h5v5h-5zM3.5 3.5v-2h5v5h-2" />
          ) : (
            <path d="M1.5 1.5h7v7h-7z" />
          )}
        </svg>
      </button>
      {/* close() goes through onCloseRequested, so pending saves are flushed first. */}
      <button class="win-btn win-close" onClick={() => void win.close()} title="Fechar" aria-label="Fechar">
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
        </svg>
      </button>
    </div>
  );
}
