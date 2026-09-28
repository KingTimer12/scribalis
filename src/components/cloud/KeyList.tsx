import { createResource, createSignal, For, Show } from "solid-js";
import { cloudAddKey, cloudKeys, cloudRevokeKey } from "../../api/cloud";
import type { NewKey } from "../../api/types";
import { flash, flashError } from "../../store/actions/ui";

/** Device keys; a new one is shown once, to paste on the other computer. */
export function KeyList() {
  const [keys, { mutate }] = createResource(cloudKeys);
  const [fresh, setFresh] = createSignal<NewKey | null>(null);
  const [armed, setArmed] = createSignal<string | null>(null);

  const add = async () => {
    try {
      setFresh(await cloudAddKey("Outro computador"));
      mutate(await cloudKeys());
    } catch (e) {
      flashError(e);
    }
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
                classList={{ armed: armed() === k.id }}
                onClick={() => (armed() === k.id ? void revoke(k.id) : setArmed(k.id))}
                onBlur={() => armed() === k.id && setArmed(null)}
              >
                {armed() === k.id ? "Confirmar" : "Revogar"}
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
