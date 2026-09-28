import { For } from "solid-js";
import { applySpacingToAll, clearParagraphFormat, formatState, setSpacing } from "../../editor/format";
import type { SpacingKey } from "../../editor/spacing";
import { focusRef } from "../../store/focus";
import { Hint } from "../ui/Hint";

const LINE_HEIGHTS: { v: number | null; label: string }[] = [
  { v: 1, label: "1" },
  { v: 1.15, label: "1,15" },
  { v: 1.5, label: "1,5" },
  { v: 2, label: "2" },
  { v: null, label: "Padrão" },
];

const DEFAULT_INDENT = 1.25;

/** Number field bound to one paragraph attribute; empty means the default (null). */
function SpacingField(props: { id: string; key: SpacingKey; label: string; min: number; max: number; step: number }) {
  // Applied on change (blur / Enter / spinner step), not on every keystroke: a keystroke-level
  // input handler would push one undo step per digit and could clear the field mid-typing of a
  // decimal (e.g. "1.") on engines that don't report `validity.badInput` for it.
  const onChange = (el: HTMLInputElement) => {
    if (el.validity.badInput) return;
    if (el.value.trim() === "") return setSpacing({ [props.key]: null });
    const n = Number(el.value);
    if (!Number.isFinite(n)) return;
    setSpacing({ [props.key]: Math.min(props.max, Math.max(props.min, n)) });
  };
  return (
    <div class="sp-field">
      <label for={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="number"
        class="sp-input"
        min={props.min}
        max={props.max}
        step={props.step}
        placeholder="Padrão"
        value={formatState()[props.key] ?? ""}
        onChange={(e) => onChange(e.currentTarget)}
      />
    </div>
  );
}

/** Spacing of the paragraph at the caret; every change applies immediately. */
export function SpacingPanel() {
  const current = () => {
    const f = formatState();
    return { lineHeight: f.lineHeight, spaceBefore: f.spaceBefore, spaceAfter: f.spaceAfter, indent: f.indent };
  };

  return (
    <div class="spacing" role="dialog" aria-label="Espaçamento do parágrafo">
      <div class="flex items-baseline justify-between">
        <div class="ui cap">Espaçamento</div>
        <Hint keys="Esc">voltar ao texto</Hint>
      </div>

      <div class="sp-group" role="group" aria-labelledby="sp-lh">
        <span id="sp-lh" class="sp-label">
          Entrelinhas
        </span>
        <div class="sp-row">
          <For each={LINE_HEIGHTS}>
            {(o, i) => (
              <button
                type="button"
                class="sp-btn"
                aria-pressed={formatState().lineHeight === o.v}
                ref={i() === 0 ? focusRef("spacing") : undefined}
                onClick={() => setSpacing({ lineHeight: o.v })}
              >
                {o.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="sp-row">
        <SpacingField id="sp-before" key="spaceBefore" label="Antes (pt)" min={0} max={96} step={1} />
        <SpacingField id="sp-after" key="spaceAfter" label="Depois (pt)" min={0} max={96} step={1} />
      </div>

      <div class="sp-row items-end">
        <SpacingField id="sp-indent" key="indent" label="Recuo da primeira linha (cm)" min={0} max={5} step={0.05} />
        <button
          type="button"
          class="sp-btn"
          aria-pressed={formatState().indent === DEFAULT_INDENT}
          onClick={() => setSpacing({ indent: DEFAULT_INDENT })}
        >
          1,25 cm
        </button>
      </div>

      <div class="sp-actions">
        <button type="button" class="sp-btn" onClick={() => applySpacingToAll(current())}>
          Aplicar ao capítulo todo
        </button>
        <button type="button" class="sp-btn" onClick={clearParagraphFormat}>
          Limpar formatação do parágrafo
        </button>
      </div>
    </div>
  );
}
