import { createEffect, createResource, createSignal, For, on, Show } from "solid-js";
import { cloudRemoteBooks, cloudVaultInfo } from "../../api/cloud";
import { activateCloud, confirmDeleteVault, connectCloud, downloadBook, setApiUrl } from "../../store/actions/cloud";
import { state } from "../../store/state";
import { KeyList } from "./KeyList";

const mb = (bytes: number) => Math.round(bytes / 1_048_576).toLocaleString("pt-BR") + " MB";

/** "Geral": server address, activate/connect, usage, other computers, books only in the vault. */
export function VaultSection() {
  const [url, setUrl] = createSignal(state.cloud?.apiUrl ?? "");
  // The overview may arrive after the panel opens (and changes after saving).
  createEffect(on(() => state.cloud?.apiUrl, (u) => u && setUrl(u)));
  const [code, setCode] = createSignal("");
  const connected = () => !!state.cloud?.connected;
  const [info] = createResource(() => connected() || null, () => cloudVaultInfo().catch(() => null));
  const [remote, { refetch }] = createResource(() => connected() || null, () => cloudRemoteBooks().catch(() => []));

  return (
    <div class="cloud-sec">
      <div class="ui cap">Nuvem</div>
      <label class="cloud-sec" style={{ gap: "6px" }}>
        <span class="ui">Endereço da API</span>
        <input class="cloud-input" value={url()} onInput={(e) => setUrl(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
      </label>
      <Show when={state.cloud && url().trim().replace(/\/+$/, "") !== state.cloud.apiUrl}>
        <button class="cloud-btn" onClick={() => void setApiUrl(url())}>Salvar endereço</button>
        <div class="cloud-warn">As obras do cofre atual continuam no servidor antigo.</div>
      </Show>
      <Show
        when={connected()}
        fallback={
          <>
            <button class="cloud-btn" onClick={() => void activateCloud("Meu computador")}>Ativar a nuvem</button>
            <input class="cloud-input" placeholder="scb_… (código de outro computador)" value={code()} onInput={(e) => setCode(e.currentTarget.value)} onKeyDown={(e) => e.stopPropagation()} />
            <button class="cloud-btn" onClick={() => void connectCloud(code())}>Conectar a um cofre</button>
          </>
        }
      >
        <Show when={info()}>{(i) => <div class="ui">{mb(i().usage.bytes)} de {mb(i().usage.quota)}</div>}</Show>
        <KeyList />
        <For each={(remote() ?? []).filter((b) => !b.local && b.latestAt)}>
          {(b) => (
            <div class="cloud-row">
              <span>{b.title || "Obra sem título"}</span>
              <button class="cloud-btn" onClick={() => void downloadBook(b.id).then(() => refetch())}>Baixar</button>
            </div>
          )}
        </For>
        <button
          class="cloud-btn danger"
          onClick={() => void confirmDeleteVault()}
        >
          Apagar cofre
        </button>
      </Show>
    </div>
  );
}
