import { createResource, createSignal, For, Show } from "solid-js";
import { cloudAddKey, cloudKeys, cloudRevokeKey } from "../../api/cloud";
import type { NewKey } from "../../api/types";
import { askConfirm } from "../../store/confirm";
import { flash, flashError } from "../../store/actions/ui";

/** Device keys; a new one is shown once, to paste on the other computer. */
export function KeyList() {
  const [keys, { mutate }] = createResource(cloudKeys);
  const [fresh, setFresh] = createSignal<NewKey | null>(null);

  const add = async () => {
    try {
      setFresh(await cloudAddKey("Outro computador"));
      mutate(await cloudKeys());
    } catch (e) {
      flashError(e);
    }
  };
  const confirmRevoke = async (id: string, label: string) => {
    const ok = await askConfirm({
      title: "Revogar a chave “" + label + "”?",
      message: "Esse computador perde o acesso ao cofre. Para voltar, ele precisa de um código novo.",
      confirmLabel: "Revogar",
      danger: true,
    });
    if (ok) await revoke(id);
  };
  const revoke = async (id: string) => {
    try {
      mutate(await cloudRevokeKey(id));
      flash("Chave revogada");
    } catch (e) {
      flashError(e);
    }
  };

  return (
    <div class="cloud-sec">
      <div class="ui cap">Computadores</div>
      <For each={keys() ?? []}>
        {(k) => (
          <div class="cloud-row">
            <span>{k.label}{k.current ? " (este computador)" : ""}</span>
            <Show when={!k.current}>
              <button
                class="cloud-btn danger"
                onClick={() => void confirmRevoke(k.id, k.label)}
              >
                Revogar
              </button>
            </Show>
          </div>
        )}
      </For>
      <Show
        when={fresh()}
        fallback={<button class="cloud-btn" onClick={() => void add()}>Adicionar computador</button>}
      >
        {(k) => (
          <div class="cloud-sec" style={{ gap: "6px" }}>
            <div class="cloud-warn">Cole este código no outro computador, em "Conectar a um cofre". Quem tiver este código acessa todas as obras do cofre.</div>
            <input class="cloud-input" readOnly value={k().secret} onFocus={(e) => e.currentTarget.select()} />
            <button class="cloud-btn" onClick={() => void navigator.clipboard.writeText(k().secret).then(() => flash("Código copiado"))}>Copiar código</button>
          </div>
        )}
      </Show>
    </div>
  );
}
