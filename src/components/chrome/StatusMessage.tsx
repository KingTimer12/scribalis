import { Show } from "solid-js";
import { state } from "../../store/state";
import { Kbd } from "../ui/Kbd";

/** Centro da barra inferior: toast ou aviso do terceiro Enter. */
export function StatusMessage() {
  const showTriple = () => state.tripleHint && !state.toast && state.view === "editor";
  return (
    <>
      {/* keyed: cada toast novo remonta e reinicia a animação */}
      <Show when={state.toast ? state.toastKey : false} keyed>
        <span class="toast text-ink">{state.toast}</span>
      </Show>
      <Show when={showTriple()}>
        <span class="pulse hint gap-2 text-accent">
          <Kbd class="border-accent text-accent">Enter</Kbd>
          mais uma vez para abrir um novo capítulo
        </span>
      </Show>
    </>
  );
}
