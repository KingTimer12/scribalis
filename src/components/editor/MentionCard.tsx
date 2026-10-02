import { createSignal, For, onCleanup, Show } from "solid-js";
import { avatarText, cardPreview, hueOf, nameLookup } from "../../lib/sheets";
import { goToSheet, KIND_LABEL } from "../../store/actions/sheets";
import { state } from "../../store/state";

/** Hover delay before the card shows, and grace time to move the pointer onto it. */
const SHOW_MS = 300;
const HIDE_MS = 200;

interface Shown {
  id: string;
  label: string;
  left: number;
  top: number;
}

/** Card with a sheet's details while the pointer rests on an `@mention` in the text. */
export function MentionCard() {
  const [shown, setShown] = createSignal<Shown | null>(null);
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  const hideSoon = () => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => setShown(null), HIDE_MS);
  };
  const keep = () => clearTimeout(hideTimer);

  const onOver = (e: MouseEvent) => {
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(".ed-body .mention");
    if (!el) return;
    keep();
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      const box = el.getBoundingClientRect();
      const left = Math.min(box.left, window.innerWidth - 336);
      setShown({ id: el.dataset.id ?? "", label: el.textContent ?? "", left: Math.max(8, left), top: box.bottom + 6 });
    }, SHOW_MS);
  };
  const onOut = (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.(".ed-body .mention")) hideSoon();
  };
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mouseout", onOut);
  // Typing or scrolling moves the text away from the card.
  const hideNow = () => {
    clearTimeout(showTimer);
    setShown(null);
  };
  document.addEventListener("keydown", hideNow, true);
  document.addEventListener("scroll", hideNow, true);
  onCleanup(() => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    document.removeEventListener("mouseover", onOver);
    document.removeEventListener("mouseout", onOut);
    document.removeEventListener("keydown", hideNow, true);
    document.removeEventListener("scroll", hideNow, true);
  });

  const sheet = () => state.sheets?.sheets.find((s) => s.id === shown()?.id) ?? null;

  return (
    <Show when={shown()}>
      {(at) => (
        <div
          class="mcard"
          role="tooltip"
          style={{ left: at().left + "px", top: at().top + "px" }}
          onMouseEnter={keep}
          onMouseLeave={hideSoon}
        >
          <Show
            when={sheet()}
            fallback={
              <p class="ui mcard-gone">
                {at().label}: esta ficha não existe mais.
              </p>
            }
          >
            {(s) => {
              const fields = () => cardPreview(s(), state.sheets?.templates[s().kind] ?? [], nameLookup(state.sheets), 12);
              return (
                <>
                  <div class="sc-head">
                    <span class="sc-avatar" style={{ "--hue": hueOf(s().id) }} aria-hidden="true">
                      {avatarText(s())}
                    </span>
                    <div class="mcard-title">
                      <span class="sc-name">{s().name.trim() || "Sem nome"}</span>
                      <span class="ui">{KIND_LABEL[s().kind].one}</span>
                    </div>
                  </div>
                  <Show when={fields().length} fallback={<p class="sc-none ui">Nada preenchido ainda.</p>}>
                    <dl class="sc-fields">
                      <For each={fields()}>
                        {(f) => (
                          <div class="sc-field">
                            <dt class="ui">{f.label}</dt>
                            <dd>{f.value}</dd>
                          </div>
                        )}
                      </For>
                    </dl>
                  </Show>
                  <button
                    type="button"
                    class="sheets-link mcard-open"
                    onClick={() => {
                      setShown(null);
                      void goToSheet(s().id);
                    }}
                  >
                    Abrir ficha
                  </button>
                </>
              );
            }}
          </Show>
        </div>
      )}
    </Show>
  );
}
