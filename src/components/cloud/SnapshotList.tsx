import { createResource, createSignal, For, Show } from "solid-js";
import { cloudSnapshots } from "../../api/cloud";
import { ago } from "../../lib/format";
import { restoreSnapshot } from "../../store/actions/cloud";
import { state } from "../../store/state";

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1).replace(".", ",") + " MB";

/** The book's backups on the server; "Restaurar" needs a second click to run. */
export function SnapshotList() {
  const [list] = createResource(() => state.cloudBook?.lastBackupAt ?? 0, () => cloudSnapshots(state.book!.id));
  const [armed, setArmed] = createSignal<string | null>(null);

  return (
    <div class="cloud-sec">
      <div class="ui cap">Backups</div>
      <Show when={!list.loading} fallback={<div class="ui">Carregando…</div>}>
        <For each={list() ?? []} fallback={<div class="ui">Nenhum backup ainda.</div>}>
          {(s) => (
            <div class="cloud-row">
              <span>
                {ago(s.createdAt)} · {s.fileCount} arq. · {mb(s.totalSize)}
              </span>
              <button
                class="cloud-btn danger"
                classList={{ armed: armed() === s.id }}
                onClick={() => (armed() === s.id ? void restoreSnapshot(s.id) : setArmed(s.id))}
                onBlur={() => armed() === s.id && setArmed(null)}
              >
                {armed() === s.id ? "Confirmar: substituir a obra" : "Restaurar"}
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
