import { createSignal } from "solid-js";
import { createShare } from "../../store/actions/cloud";
import { setState, state, type ShareDraft } from "../../store/state";

const EXPIRY: [string, number | null][] = [["nunca", null], ["1 dia", 1], ["7 dias", 7], ["30 dias", 30]];

/** Options for a new link; creating copies its URL. */
export function ShareForm(props: { draft: ShareDraft; onDone: () => void }) {
  const [comments, setComments] = createSignal(true);
  const [notes, setNotes] = createSignal(false);
  const [freeze, setFreeze] = createSignal(false);
  const [expiry, setExpiry] = createSignal<number | null>(null);

  const submit = async () => {
    const book = state.book;
    if (!book) return;
    const share = await createShare({
      bookId: book.id, kind: props.draft.kind, target: props.draft.target, freeze: freeze(),
      includeNotes: notes(), allowComments: comments(), expiresInDays: expiry(),
    });
    if (share) props.onDone();
  };

  return (
    <div class="cloud-sec">
      <div class="ui cap">Compartilhar · {props.draft.label}</div>
      {!state.cloudBook?.enabled && <div class="cloud-warn">O backup desta obra será ligado: o link mostra o último backup.</div>}
      <label class="cloud-row">
        Comentários <input type="checkbox" checked={comments()} onChange={(e) => setComments(e.currentTarget.checked)} />
      </label>
      <label class="cloud-row">
        Incluir notas <input type="checkbox" checked={notes()} onChange={(e) => setNotes(e.currentTarget.checked)} />
      </label>
      <label class="cloud-row">
        Congelar esta versão <input type="checkbox" checked={freeze()} onChange={(e) => setFreeze(e.currentTarget.checked)} />
      </label>
      <label class="cloud-row">
        Expira
        <select class="cloud-input" style={{ width: "auto" }} onChange={(e) => setExpiry(EXPIRY[Number(e.currentTarget.value)][1])}>
          {EXPIRY.map(([label], i) => <option value={i}>{label}</option>)}
        </select>
      </label>
      <div class="cloud-row">
        <button class="cloud-btn" onClick={() => { setState("shareDraft", null); props.onDone(); }}>Cancelar</button>
        <button class="cloud-btn" onClick={() => void submit()}>Criar e copiar link</button>
      </div>
    </div>
  );
}
