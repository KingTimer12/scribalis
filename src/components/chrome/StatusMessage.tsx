import { Show } from "solid-js";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Kbd } from "../ui/Kbd";

/** Bottom bar center: toast or the third-Enter hint. */
export function StatusMessage() {
  const showTriple = () => state.tripleHint && !state.toast && !!currentChapter();
  return (
    <>
      {/* keyed: each new toast remounts and restarts the animation */}
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
