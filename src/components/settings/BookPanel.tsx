import { onMount, Show } from "solid-js";
import { loadBookCloud, loadCloud } from "../../store/actions/cloud";
import { closePanel, openSettings } from "../../store/actions/ui";
import { focusRef } from "../../store/focus";
import { state } from "../../store/state";
import { BookCloudSection } from "../cloud/BookCloudSection";
import { Hint } from "../ui/Hint";
import { IconClose } from "../ui/icons";
import { Scrim } from "../ui/Scrim";
import { BookSettings } from "./BookSettings";

/** Book drawer (Ctrl Shift S): what belongs to the open book only — author, cover, images, backup and links. */
export function BookPanel() {
  onMount(() => {
    void loadCloud();
    if (state.book) void loadBookCloud(state.book.id);
  });

  return (
    <>
      <Scrim />
      <div class="drawer right" tabIndex={-1} ref={focusRef("bookPanel")}>
        <div class="flex items-baseline justify-between">
          <div class="ui cap">Esta obra</div>
          <button type="button" class="set-close" title="Fechar (Esc)" aria-label="Fechar" onClick={closePanel}>
            <IconClose />
          </button>
        </div>
        <div class="set-scroll">
          <BookSettings />
          <Show
            when={state.cloud?.connected}
            fallback={
              <div class="cloud-sec">
                <div class="ui cap set-head">Nuvem</div>
                <p class="ui">A nuvem ainda não está ligada neste computador.</p>
                <button type="button" class="cloud-btn" onClick={() => openSettings("cloud")}>Abrir configurações da nuvem</button>
              </div>
            }
          >
            <BookCloudSection />
          </Show>
        </div>
        <div class="drawer-foot">
          <Hint keys="Esc">fechar</Hint>
        </div>
      </div>
    </>
  );
}
