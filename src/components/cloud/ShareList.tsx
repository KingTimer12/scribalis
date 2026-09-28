import { createResource, createSignal, For, Show } from "solid-js";
import { cloudShareChange, cloudShareRevoke, cloudShares } from "../../api/cloud";
import type { Share } from "../../api/types";
import { ago } from "../../lib/format";
import { flash, flashError } from "../../store/actions/ui";
import { state } from "../../store/state";

function describe(s: Share) {
  const what = s.kind === "chapter" ? "Capítulo" : s.target ? "Item da área" : "Área de trabalho";
  const until = s.expiresAt ? " · expira " + ago(s.expiresAt) : "";
  return `${what} · ${s.views} visitas · ${s.allowComments ? "com" : "sem"} comentários${until}`;
}

/** Links of the open book: copy, toggle comments, revoke (second click confirms). */
export function ShareList(props: { refresh: number }) {
  const [list, { mutate, refetch }] = createResource(() => props.refresh + 1, () => cloudShares(state.book!.id));
  const [armed, setArmed] = createSignal<string | null>(null);

  const toggleComments = async (s: Share) => {
    try {
      const next = await cloudShareChange(state.book!.id, s.id, { allowComments: !s.allowComments });
      mutate((l) => l?.map((x) => (x.id === s.id ? next : x)));
    } catch (e) {
      flashError(e);
    }
  };
  const revoke = async (s: Share) => {
    try {
      await cloudShareRevoke(s.id);
      await refetch();
      flash("Link revogado");
    } catch (e) {
      flashError(e);
    }
  };

  return (
    <Show when={(list() ?? []).length > 0}>
      <div class="cloud-sec">
        <div class="ui cap">Links</div>
        <For each={list()}>
          {(s) => (
            <div class="cloud-sec" style={{ gap: "6px" }}>
              <div class="ui">{describe(s)}</div>
              <div class="cloud-row" style={{ "justify-content": "flex-start" }}>
                <button class="cloud-btn" onClick={() => void navigator.clipboard.writeText(s.url).then(() => flash("Link copiado"))}>Copiar</button>
                <button class="cloud-btn" onClick={() => void toggleComments(s)}>{s.allowComments ? "Desligar comentários" : "Ligar comentários"}</button>
                <button
                  class="cloud-btn danger"
                  classList={{ armed: armed() === s.id }}
                  onClick={() => (armed() === s.id ? void revoke(s) : setArmed(s.id))}
                  onBlur={() => armed() === s.id && setArmed(null)}
                >
                  {armed() === s.id ? "Confirmar" : "Revogar"}
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
