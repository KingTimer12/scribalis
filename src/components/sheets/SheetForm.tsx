import { For, Show } from "solid-js";
import type { Sheet } from "../../api/types";
import { scheduleSheetName } from "../../store/actions/sheetEdits";
import { KIND_LABEL, openSheet, requestDeleteSheet } from "../../store/actions/sheets";
import { startTemplateEdit } from "../../store/actions/sheetTemplate";
import { focusRef } from "../../store/focus";
import { state } from "../../store/state";
import { SheetFieldControl } from "./SheetFieldControl";

/** One sheet, filled in field by field as its kind's template says. */
export function SheetForm(props: { sheet: Sheet }) {
  const label = () => KIND_LABEL[props.sheet.kind];
  const template = () => state.sheets?.templates[props.sheet.kind] ?? [];
  return (
    <div class="sf-page">
      <div class="sf-bar">
        <button type="button" class="sheets-btn" onClick={() => void openSheet(null)}>
          ← {label().many}
        </button>
        <button type="button" class="sheets-btn danger" onClick={() => void requestDeleteSheet(props.sheet.id)}>
          Excluir ficha
        </button>
      </div>
      <input
        class="sf-name"
        aria-label={"Nome do " + label().one}
        placeholder={"Nome do " + label().one}
        value={props.sheet.name}
        ref={focusRef("sheetName")}
        autocomplete="off"
        onInput={(e) => scheduleSheetName(props.sheet.id, e.currentTarget.value)}
      />
      <Show
        when={template().length}
        fallback={
          <p class="sheets-empty ui">
            O molde está vazio.{" "}
            <button type="button" class="sheets-link" onClick={() => void startTemplateEdit()}>
              Adicionar campos ao molde
            </button>
          </p>
        }
      >
        <div class="sf-fields">
          <For each={template()}>
            {(f) => <SheetFieldControl sheetId={props.sheet.id} field={f} value={props.sheet.values[f.id]} />}
          </For>
        </div>
      </Show>
    </div>
  );
}
