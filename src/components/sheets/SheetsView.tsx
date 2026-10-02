import { For, Match, Show, Switch } from "solid-js";
import type { SheetKind } from "../../api/types";
import { filterSheets } from "../../lib/sheets";
import { createSheet, KIND_LABEL, openSheet, setSheetKind } from "../../store/actions/sheets";
import { startTemplateEdit } from "../../store/actions/sheetTemplate";
import { focusRef } from "../../store/focus";
import { setState, state } from "../../store/state";
import { SheetCard } from "./SheetCard";
import { SheetForm } from "./SheetForm";
import { TemplateEditor } from "./TemplateEditor";

const KINDS: SheetKind[] = ["character", "place"];

function KindTab(props: { kind: SheetKind }) {
  const count = () => state.sheets?.sheets.filter((s) => s.kind === props.kind).length ?? 0;
  const on = () => state.sheetKind === props.kind;
  return (
    <button
      type="button"
      role="tab"
      class="sheets-kind ui"
      classList={{ on: on() }}
      aria-selected={on()}
      onClick={() => void setSheetKind(props.kind)}
    >
      {KIND_LABEL[props.kind].many}
      <span class="sheets-count">{count()}</span>
    </button>
  );
}

function Grid() {
  const label = () => KIND_LABEL[state.sheetKind];
  const list = () => (state.sheets ? filterSheets(state.sheets, state.sheetKind, state.sheetQ) : []);
  const template = () => state.sheets?.templates[state.sheetKind] ?? [];
  const none = () => !state.sheets?.sheets.some((s) => s.kind === state.sheetKind);
  return (
    <Show
      when={!none()}
      fallback={
        <div class="sheets-start">
          <p class="ui">Nenhum {label().one} ainda.</p>
          <button type="button" class="sheets-btn primary big" onClick={() => void createSheet()}>
            Criar o primeiro {label().one}
          </button>
        </div>
      }
    >
      <div class="sc-grid">
        <For each={list()} fallback={<p class="sheets-empty ui">Nada encontrado para «{state.sheetQ.trim()}».</p>}>
          {(s) => <SheetCard sheet={s} template={template()} />}
        </For>
      </div>
    </Show>
  );
}

/** The book's "Fichas": character and place cards, each kind following its own template. */
export function SheetsView() {
  const label = () => KIND_LABEL[state.sheetKind];
  const selected = () => state.sheets?.sheets.find((s) => s.id === state.sheetSel) ?? null;
  const onKey = (e: KeyboardEvent) => {
    // Esc closes the open sheet back to the grid (the template draft keeps its own buttons).
    if (e.key === "Escape" && state.sheetSel && !state.templateDraft) {
      e.preventDefault();
      e.stopPropagation();
      void openSheet(null);
    }
  };
  return (
    <section class="sheets" tabindex="-1" ref={focusRef("sheets")} aria-label="Fichas" onKeyDown={onKey}>
      <header class="sheets-head">
        <div class="sheets-kinds" role="tablist" aria-label="Tipo de ficha">
          <For each={KINDS}>{(k) => <KindTab kind={k} />}</For>
        </div>
        <Show when={!state.sheetSel && !state.templateDraft}>
          <input
            class="sheets-search ui"
            type="search"
            aria-label={"Buscar " + label().many.toLowerCase()}
            placeholder="Buscar…"
            value={state.sheetQ}
            onInput={(e) => setState("sheetQ", e.currentTarget.value)}
          />
        </Show>
        <div class="flex-1" />
        <Show when={!state.templateDraft}>
          <button type="button" class="sheets-btn" title={"Campos de todo cartão de " + label().one} onClick={() => void startTemplateEdit()}>
            Molde
          </button>
          <button type="button" class="sheets-btn primary" onClick={() => void createSheet()}>
            + {label().fresh}
          </button>
        </Show>
      </header>
      <div class="sheets-body">
        <Show when={state.sheets} fallback={<p class="sheets-empty ui">Carregando…</p>}>
          <Switch fallback={<Grid />}>
            <Match when={state.templateDraft}>
              <TemplateEditor />
            </Match>
            <Match when={selected()}>{(s) => <SheetForm sheet={s()} />}</Match>
          </Switch>
        </Show>
      </div>
    </section>
  );
}
