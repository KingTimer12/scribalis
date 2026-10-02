import { For, Match, Show, Switch } from "solid-js";
import type { SheetField, SheetValue } from "../../api/types";
import { norm } from "../../lib/format";
import { tagPool } from "../../lib/sheets";
import { scheduleSheetValue, setSheetValueNow } from "../../store/actions/sheetEdits";
import { goToSheet, KIND_LABEL } from "../../store/actions/sheets";
import { state } from "../../store/state";
import { ChipField } from "./ChipField";

const asList = (v: SheetValue | undefined): string[] => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []);

/** Sheets a reference field may point at, as chips (name, id). */
function targets(field: SheetField) {
  return (state.sheets?.sheets ?? [])
    .filter((s) => s.kind === field.target)
    .map((s) => ({ value: s.id, label: s.name.trim() || "Sem nome" }));
}

/**
 * One field of a sheet, drawn by its type: one line, free text, a list of options, yes/no,
 * references to other sheets, or tags.
 */
export function SheetFieldControl(props: { sheetId: string; field: SheetField; value: SheetValue | undefined }) {
  const id = () => "sf-" + props.field.id;
  const text = () => (typeof props.value === "string" ? props.value : "");
  const on = () => props.value === true;
  const save = (v: SheetValue | null) => void setSheetValueNow(props.sheetId, props.field.id, v);
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  };

  const kind = () => state.sheets?.sheets.find((s) => s.id === props.sheetId)?.kind;
  const tags = () => asList(props.value);
  /** A tag typed in another spelling ("corajosa" when "Corajosa" exists) reuses the existing one. */
  const addTag = (typed: string) => {
    const pool = state.sheets && kind() ? tagPool(state.sheets, kind()!, props.field.id) : [];
    const tag = pool.find((t) => norm(t) === norm(typed)) ?? typed;
    save([...tags(), tag]);
  };

  const refs = () => {
    const all = targets(props.field);
    return asList(props.value).flatMap((v) => all.filter((t) => t.value === v));
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
          <select id={id()} class="sf-input sf-select" onChange={(e) => save(e.currentTarget.value || null)}>
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
            onClick={() => save(!on())}
          >
            <span class="sf-knob" aria-hidden="true" />
            <span class="ui">{on() ? "Sim" : "Não"}</span>
          </button>
        </Match>
        <Match when={props.field.type === "tags"}>
          <ChipField
            id={id()}
            chips={tags().map((t) => ({ value: t, label: t }))}
            options={state.sheets && kind() ? tagPool(state.sheets, kind()!, props.field.id).map((t) => ({ value: t, label: t })) : []}
            create
            placeholder={tags().length ? "" : "Digite e tecle Enter"}
            onAdd={addTag}
            onRemove={(t) => save(tags().filter((x) => x !== t))}
          />
        </Match>
        <Match when={props.field.type === "reference" && props.field.multiple}>
          <ChipField
            id={id()}
            chips={refs()}
            options={targets(props.field)}
            placeholder={refs().length ? "" : "Escolha na lista…"}
            onAdd={(v) => save([...asList(props.value), v])}
            onRemove={(v) => save(asList(props.value).filter((x) => x !== v))}
            onOpen={(v) => void goToSheet(v)}
          />
        </Match>
        <Match when={props.field.type === "reference"}>
          <div class="sf-ref">
            <select id={id()} class="sf-input sf-select" onChange={(e) => save(e.currentTarget.value || null)}>
              <option value="" selected={!text()}>
                —
              </option>
              <For each={targets(props.field)}>
                {(t) => (
                  <option value={t.value} selected={t.value === text()}>
                    {t.label}
                  </option>
                )}
              </For>
            </select>
            <Show when={refs()[0]}>
              {(r) => (
                <button type="button" class="sheets-link" onClick={() => void goToSheet(r().value)}>
                  Abrir {r().label}
                </button>
              )}
            </Show>
          </div>
          <Show when={!targets(props.field).length}>
            <p class="sf-hint ui">{KIND_LABEL[props.field.target ?? "character"].none}</p>
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
