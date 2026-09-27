import { Show } from "solid-js";
import { installUpdate } from "../../store/actions/update";
import { state } from "../../store/state";

/** Offers a newer release found at startup; installing restarts the app. */
export function UpdateBadge() {
  return (
    <Show when={state.update}>
      {(u) => (
        <button
          class="ui update-badge"
          onClick={() => void installUpdate()}
          disabled={state.updating}
          title={u().notes ?? undefined}
        >
          {state.updating ? "Atualizando…" : `Versão ${u().version} disponível · instalar`}
        </button>
      )}
    </Show>
  );
}
