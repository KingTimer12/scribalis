import { For, Show } from "solid-js";
import { avatarText, hueOf } from "../../lib/sheets";
import { KIND_LABEL } from "../../store/actions/sheets";
import { mentionIndex, mentionOptions, mentionQuery, pickMention, setMentionIndex } from "../../store/mentions";

/** Sheets matching what follows a typed `@`, under it; arrows, Enter or a click pick one. */
export function MentionMenu() {
  return (
    <Show when={mentionQuery() && mentionOptions().length ? mentionQuery() : null}>
      {(q) => (
        <ul
          class="mmenu"
          role="listbox"
          aria-label="Fichas para mencionar"
          style={{ left: q().left + "px", top: q().bottom + 6 + "px" }}
        >
          <For each={mentionOptions()}>
            {(s, i) => (
              <li
                role="option"
                class="mmenu-opt"
                classList={{ on: i() === mentionIndex() }}
                aria-selected={i() === mentionIndex()}
                onMouseEnter={() => setMentionIndex(i())}
                // mousedown: the editor keeps its focus and caret.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(s);
                }}
              >
                <span class="sc-avatar small" style={{ "--hue": hueOf(s.id) }} aria-hidden="true">
                  {avatarText(s)}
                </span>
                <span class="mmenu-name">{s.name}</span>
                <span class="ui">{KIND_LABEL[s.kind].one}</span>
              </li>
            )}
          </For>
        </ul>
      )}
    </Show>
  );
}
