import { createSignal, Show } from "solid-js";
import { ago, pad } from "../../lib/format";
import { backupNow, confirmForgetBook, fetchComments, setBookBackup } from "../../store/actions/cloud";
import { setBookEncrypted } from "../../store/actions/cloudCrypto";
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
      <div class="ui cap set-head">Nuvem</div>
      <label class="cloud-row">
        Backup na nuvem
        <input type="checkbox" checked={!!view()?.enabled} onChange={(e) => void setBookBackup(e.currentTarget.checked)} />
      </label>
      <label class="cloud-row">
        Criptografar e comprimir
        <input type="checkbox" checked={view()?.encrypted ?? true} onChange={(e) => {
          const box = e.currentTarget;
          const want = box.checked;
          // The checkbox follows the store, not the click: it only moves if the user confirms.
          box.checked = !want;
          void setBookEncrypted(want);
        }} />
      </label>
      <div class="ui crypt-note">
        {view()?.encrypted ?? true
          ? "Só os computadores do cofre leem os backups. Links públicos ficam desligados."
          : "Backups abertos: o servidor lê a obra para mostrar os links públicos."}
      </div>
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
        when={!(view()?.encrypted ?? true)}
        fallback={
          <Show when={state.shareDraft}>
            <div class="cloud-warn">
              Links públicos precisam da obra aberta: o servidor tem que ler o texto para mostrar a página.
              <button class="cloud-btn" onClick={() => void setBookEncrypted(false)}>Deixar aberta para links</button>
              <button class="cloud-btn" onClick={() => setState("shareDraft", null)}>Cancelar</button>
            </div>
          </Show>
        }
      >
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
