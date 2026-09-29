import { createSignal, Show } from "solid-js";
import { ago, pad } from "../../lib/format";
import { backupNow, confirmForgetBook, fetchComments, setBookBackup } from "../../store/actions/cloud";
import { currentChapter, currentNumber } from "../../store/selectors/book";
import { setState, state } from "../../store/state";
import { ShareForm } from "./ShareForm";
import { ShareList } from "./ShareList";
import { SnapshotList } from "./SnapshotList";

/** "Esta obra": backup toggle and state, backups, links, comments, removal from the server. */
export function BookCloudSection() {
  const [refresh, setRefresh] = createSignal(0);
  const view = () => state.cloudBook;
  const status = () => (state.cloudStatus?.bookId === state.book?.id ? state.cloudStatus : null);
  const statusText = () => {
    const s = status();
    if (s?.state === "sending") {
      const n = s.fileCount ?? 0;
      return `Enviando ${n} arquivo${n === 1 ? "" : "s"}…`;
    }
    if (s?.state === "offline") return "Sem conexão, tenta de novo em alguns minutos";
    return view()?.lastBackupAt ? "Último backup: " + ago(view()!.lastBackupAt!) : "Sem backup ainda";
  };
  const shareChapter = () => {
    const c = currentChapter();
    if (c) setState("shareDraft", { kind: "chapter", target: c.id, label: "Capítulo " + pad(currentNumber()) });
  };

  return (
    <div class="cloud-sec">
      <div class="ui cap">Esta obra</div>
      <label class="cloud-row">
        Backup na nuvem
        <input type="checkbox" checked={!!view()?.enabled} onChange={(e) => void setBookBackup(e.currentTarget.checked)} />
      </label>
      <Show when={view()?.enabled}>
        <div class="ui">
          {statusText()}
          {view()?.paused ? " · backups automáticos parados: " + view()!.paused : ""}
        </div>
        <div class="cloud-row" style={{ "justify-content": "flex-start" }}>
          <button class="cloud-btn" onClick={() => void backupNow()}>Fazer backup agora</button>
          <button class="cloud-btn" onClick={() => void fetchComments(false)}>Buscar comentários</button>
        </div>
        <SnapshotList />
      </Show>
      <Show
        when={state.shareDraft}
        fallback={
          <div class="cloud-row" style={{ "justify-content": "flex-start" }}>
            <button class="cloud-btn" disabled={!currentChapter()} onClick={shareChapter}>Compartilhar capítulo aberto</button>
          </div>
        }
      >
        {(draft) => <ShareForm draft={draft()} onDone={() => setRefresh((n) => n + 1)} />}
      </Show>
      <ShareList refresh={refresh()} />
      <Show when={view()?.lastBackupAt}>
        <button
          class="cloud-btn danger"
          onClick={() => void confirmForgetBook()}
        >
          Apagar da nuvem
        </button>
      </Show>
    </div>
  );
}
