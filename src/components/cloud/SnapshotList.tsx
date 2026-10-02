import { createResource, For, Show } from "solid-js";
import { cloudSnapshots } from "../../api/cloud";
import { ago } from "../../lib/format";
import { confirmRestoreSnapshot } from "../../store/actions/cloud";
import { state } from "../../store/state";

const mb = (bytes: number) => (bytes / 1_048_576).toFixed(1).replace(".", ",") + " MB";

/** The book's backups on the server; "Restaurar" asks for confirmation first. */
export function SnapshotList() {
  const [list] = createResource(() => state.cloudBook?.lastBackupAt ?? 0, () => cloudSnapshots(state.book!.id));

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
                onClick={() => void confirmRestoreSnapshot(s)}
              >
                Restaurar
              </button>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
