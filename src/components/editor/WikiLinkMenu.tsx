import { For, Show } from "solid-js";
import { LINK_KIND_LABEL, splitWikiQuery } from "../../lib/wikiLinks";
import { pickWikiLink, setWikiLinkIndex, wikiLinkIndex, wikiLinkOptions, wikiLinkQuery } from "../../store/wikiLinks";
import { NodeIcon } from "../workspace/NodeIcon";

/** Chapters, documents and folders matching what follows a typed `[[`; arrows, Enter or a click pick one. */
export function WikiLinkMenu() {
  return (
    <Show when={wikiLinkQuery() && wikiLinkOptions().length ? wikiLinkQuery() : null}>
      {(q) => (
        <ul
          class="mmenu wmenu"
          role="listbox"
          aria-label="Documentos para ligar"
          style={{ left: q().left + "px", top: q().bottom + 6 + "px" }}
        >
          <Show when={splitWikiQuery(q().query).alias}>
            {(alias) => <li class="wmenu-alias ui">Aparece como “{alias()}”</li>}
          </Show>
          <For each={wikiLinkOptions()}>
            {(n, i) => (
              <li
                role="option"
                class="mmenu-opt"
                classList={{ on: i() === wikiLinkIndex() }}
                aria-selected={i() === wikiLinkIndex()}
                onMouseEnter={() => setWikiLinkIndex(i())}
                // mousedown: the editor keeps its focus and caret.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickWikiLink(n);
                }}
              >
                <span class="wmenu-ico" aria-hidden="true">
                  <NodeIcon kind={n.kind} />
                </span>
                <span class="mmenu-name">{n.title || "Sem título"}</span>
                <span class="ui">{LINK_KIND_LABEL[n.kind]}</span>
              </li>
            )}
          </For>
        </ul>
      )}
    </Show>
  );
}
