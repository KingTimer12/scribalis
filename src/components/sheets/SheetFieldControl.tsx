import { For, Match, Switch } from "solid-js";
import type { SheetField, SheetValue } from "../../api/types";
import { scheduleSheetValue, setSheetValueNow } from "../../store/actions/sheetEdits";

/** One field of a sheet, drawn by its type: one line, free text, a list of options, or yes/no. */
export function SheetFieldControl(props: { sheetId: string; field: SheetField; value: SheetValue | undefined }) {
  const id = () => "sf-" + props.field.id;
  const text = () => (typeof props.value === "string" ? props.value : "");
  const on = () => props.value === true;
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  };
  return (
    <div class="sf" data-type={props.field.type}>
      <label class="sf-label ui" for={id()}>
        {props.field.label}
      </label>
      <Switch>
        <Match when={props.field.type === "input"}>
          <input
            id={id()}
            class="sf-input"
            value={text()}
            autocomplete="off"
            onInput={(e) => scheduleSheetValue(props.sheetId, props.field.id, e.currentTarget.value)}
          />
        </Match>
        <Match when={props.field.type === "textarea"}>
          <textarea
            id={id()}
            class="sf-input sf-area"
            rows={3}
            value={text()}
            ref={(el) => queueMicrotask(() => grow(el))}
            onInput={(e) => {
              grow(e.currentTarget);
              scheduleSheetValue(props.sheetId, props.field.id, e.currentTarget.value);
            }}
          />
        </Match>
        <Match when={props.field.type === "select"}>
          <select
            id={id()}
            class="sf-input sf-select"
            onChange={(e) => void setSheetValueNow(props.sheetId, props.field.id, e.currentTarget.value || null)}
          >
            <option value="" selected={!text()}>
              —
            </option>
            <For each={props.field.options ?? []}>
              {(o) => (
                <option value={o} selected={o === text()}>
                  {o}
                </option>
              )}
            </For>
          </select>
        </Match>
        <Match when={props.field.type === "boolean"}>
          <button
            id={id()}
            type="button"
            role="switch"
            class="sf-switch"
            classList={{ on: on() }}
            aria-checked={on()}
            onClick={() => void setSheetValueNow(props.sheetId, props.field.id, !on())}
          >
            <span class="sf-knob" aria-hidden="true" />
            <span class="ui">{on() ? "Sim" : "Não"}</span>
          </button>
        </Match>
      </Switch>
    </div>
  );
}
