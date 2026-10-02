import { For, Show } from "solid-js";
import type { Sheet, SheetField } from "../../api/types";
import { cardPreview, hueOf, initials } from "../../lib/sheets";
import { openSheet } from "../../store/actions/sheets";

/** Character or place card in the grid: avatar, name and the first filled-in fields. */
export function SheetCard(props: { sheet: Sheet; template: SheetField[] }) {
  const preview = () => cardPreview(props.sheet, props.template);
  return (
    <button type="button" class="sc" onClick={() => void openSheet(props.sheet.id)}>
      <div class="sc-head">
        <span class="sc-avatar" style={{ "--hue": hueOf(props.sheet.id) }} aria-hidden="true">
          {props.sheet.kind === "character" ? initials(props.sheet.name) : "⌖"}
        </span>
        <span class="sc-name" classList={{ empty: !props.sheet.name.trim() }}>
          {props.sheet.name.trim() || "Sem nome"}
        </span>
      </div>
      <Show when={preview().length} fallback={<p class="sc-none ui">Nada preenchido ainda.</p>}>
        <dl class="sc-fields">
          <For each={preview()}>
            {(p) => (
              <div class="sc-field">
                <dt class="ui">{p.label}</dt>
                <dd>{p.value}</dd>
              </div>
            )}
          </For>
        </dl>
      </Show>
    </button>
  );
}
