import { For, Index, Show } from "solid-js";
import type { FieldType, SheetField } from "../../api/types";
import { KIND_LABEL } from "../../store/actions/sheets";
import {
  addDraftField, cancelTemplateEdit, FIELD_TYPE_LABEL, moveDraftField, removeDraftField, saveTemplate, updateDraftField,
} from "../../store/actions/sheetTemplate";
import { state } from "../../store/state";

const TYPES = Object.keys(FIELD_TYPE_LABEL) as FieldType[];

function FieldRow(props: { field: SheetField; index: number; last: boolean }) {
  const i = () => props.index;
  return (
    <li class="tpl-row">
      <div class="tpl-line">
        <input
          class="sf-input tpl-label"
          aria-label="Nome do campo"
          placeholder="Nome do campo"
          value={props.field.label}
          autocomplete="off"
          onInput={(e) => updateDraftField(i(), { label: e.currentTarget.value })}
        />
        <select
          class="sf-input tpl-type"
          aria-label="Tipo do campo"
          onChange={(e) => updateDraftField(i(), { type: e.currentTarget.value as FieldType })}
        >
          <For each={TYPES}>
            {(t) => (
              <option value={t} selected={t === props.field.type}>
                {FIELD_TYPE_LABEL[t]}
              </option>
            )}
          </For>
        </select>
        <div class="tpl-tools">
          <button type="button" class="tpl-icon" title="Subir" aria-label="Subir" disabled={i() === 0} onClick={() => moveDraftField(i(), -1)}>
            ↑
          </button>
          <button type="button" class="tpl-icon" title="Descer" aria-label="Descer" disabled={props.last} onClick={() => moveDraftField(i(), 1)}>
            ↓
          </button>
          <button type="button" class="tpl-icon danger" title="Tirar do molde" aria-label="Tirar do molde" onClick={() => removeDraftField(i())}>
            ✕
          </button>
        </div>
      </div>
      <Show when={props.field.type === "select"}>
        <textarea
          class="sf-input tpl-options"
          aria-label="Opções, uma por linha"
          placeholder={"Uma opção por linha\nEx.: Humano\nElfo"}
          rows={3}
          value={(props.field.options ?? []).join("\n")}
          onInput={(e) => updateDraftField(i(), { options: e.currentTarget.value.split("\n") })}
        />
      </Show>
    </li>
  );
}

/** "Molde": the fields every sheet of the current kind follows. Saved only with "Salvar molde". */
export function TemplateEditor() {
  const label = () => KIND_LABEL[state.sheetKind];
  const draft = () => state.templateDraft ?? [];
  return (
    <div class="tpl">
      <h2 class="tpl-title">Molde de {label().one}</h2>
      <p class="tpl-hint ui">
        Todos os cartões de {label().one} seguem estes campos, nesta ordem. Tipos: texto curto, texto longo, lista de opções e sim ou
        não.
      </p>
      <Show when={draft().length} fallback={<p class="sheets-empty ui">Nenhum campo ainda.</p>}>
        <ol class="tpl-list">
          <Index each={draft()}>{(f, i) => <FieldRow field={f()} index={i} last={i === draft().length - 1} />}</Index>
        </ol>
      </Show>
      <button type="button" class="sheets-btn tpl-add" onClick={addDraftField}>
        + Adicionar campo
      </button>
      <div class="tpl-foot">
        <button type="button" class="sheets-btn" onClick={cancelTemplateEdit}>
          Cancelar
        </button>
        <button type="button" class="sheets-btn primary" onClick={() => void saveTemplate()}>
          Salvar molde
        </button>
      </div>
    </div>
  );
}
