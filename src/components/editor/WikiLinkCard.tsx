import { createSignal, onCleanup, Show } from "solid-js";
import { plural } from "../../lib/format";
import { findNode } from "../../lib/tree";
import { LINK_KIND_LABEL, linkExcerpt } from "../../lib/wikiLinks";
import { state } from "../../store/state";
import { openWikiLink } from "../../store/wikiLinks";
import { NodeIcon } from "../workspace/NodeIcon";

/** Hover delay before the card shows, and grace time to move the pointer onto it. */
const SHOW_MS = 300;
const HIDE_MS = 200;

const SELECTOR = ".ed-body .wikilink";

interface Shown {
  id: string;
  label: string;
  left: number;
  top: number;
}

/** Card with a linked node's title, kind and synopsis while the pointer rests on a `[[link]]`. */
export function WikiLinkCard() {
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
    const el = (e.target as HTMLElement | null)?.closest?.<HTMLElement>(SELECTOR);
    if (!el) return;
    keep();
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      const box = el.getBoundingClientRect();
      const left = Math.min(box.left, window.innerWidth - 316);
      setShown({ id: el.dataset.id ?? "", label: el.textContent ?? "", left: Math.max(8, left), top: box.bottom + 6 });
    }, SHOW_MS);
  };
  const onOut = (e: MouseEvent) => {
    if ((e.target as HTMLElement | null)?.closest?.(SELECTOR)) hideSoon();
  };
  // Typing, scrolling or clicking (which opens the link) moves the text away from the card.
  const hideNow = () => {
    clearTimeout(showTimer);
    setShown(null);
  };
  document.addEventListener("mouseover", onOver);
  document.addEventListener("mouseout", onOut);
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

  const node = () => {
    const id = shown()?.id;
    return id ? findNode(state.area, id) : null;
  };

  return (
    <Show when={shown()}>
      {(at) => (
        <div
          class="mcard wcard"
          role="tooltip"
          style={{ left: at().left + "px", top: at().top + "px" }}
          onMouseEnter={keep}
          onMouseLeave={hideSoon}
        >
          <Show when={node()} fallback={<p class="ui mcard-gone">{at().label}: este documento não existe mais.</p>}>
            {(n) => (
              <>
                <div class="wcard-head">
                  <span class="wmenu-ico" aria-hidden="true">
                    <NodeIcon kind={n().kind} />
                  </span>
                  <div class="mcard-title">
                    <span class="sc-name">{n().title || "Sem título"}</span>
                    <span class="ui">
                      {LINK_KIND_LABEL[n().kind]}
                      <Show when={n().kind === "chapter" && n().words !== undefined}>
                        {" · " + plural(n().words ?? 0, "palavra", "palavras")}
                      </Show>
                    </span>
                  </div>
                </div>
                <Show when={linkExcerpt(n())} fallback={<p class="sc-none ui">Sem sinopse nem notas.</p>}>
                  {(text) => <p class="wcard-text">{text()}</p>}
                </Show>
                <button
                  type="button"
                  class="sheets-link mcard-open"
                  onClick={() => {
                    setShown(null);
                    openWikiLink(n().id);
                  }}
                >
                  Abrir
                </button>
              </>
            )}
          </Show>
        </div>
      )}
    </Show>
  );
}
