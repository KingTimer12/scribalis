import { onMount, Show } from "solid-js";
import { loadBookCloud, loadCloud } from "../../store/actions/cloud";
import { focusRef } from "../../store/focus";
import { state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { Scrim } from "../ui/Scrim";
import { BookCloudSection } from "./BookCloudSection";
import { VaultSection } from "./VaultSection";

/** Cloud drawer (Ctrl Shift S): the open book on top, then the vault. */
export function CloudPanel() {
  onMount(() => {
    void loadCloud();
    if (state.book) void loadBookCloud(state.book.id);
  });

  return (
    <>
      <Scrim />
      <div class="drawer right" tabIndex={-1} ref={focusRef("cloud")}>
        <div class="cloud-scroll">
          <Show when={state.book && state.cloud?.connected}>
            <BookCloudSection />
          </Show>
          <VaultSection />
          <p class="cloud-warn">Os arquivos não são criptografados no seu computador. Quem administra o servidor consegue lê-los.</p>
        </div>
        <Hint keys="Esc">fechar</Hint>
      </div>
    </>
  );
}
