import { For, Match, Switch } from "solid-js";
import type { SettingsTab } from "../../lib/types";
import { closePanel, openSettings } from "../../store/actions/ui";
import { focusRef } from "../../store/focus";
import { state } from "../../store/state";
import { IconClose } from "../ui/icons";
import { AppearanceSettings } from "./AppearanceSettings";
import { CloudSettings } from "./CloudSettings";
import { WritingSettings } from "./WritingSettings";

const TABS: { id: SettingsTab; label: string; hint: string }[] = [
  { id: "appearance", label: "Aparência", hint: "Tema, texto e interface" },
  { id: "writing", label: "Escrita", hint: "Meta diária" },
  { id: "cloud", label: "Nuvem", hint: "Cofre e computadores" },
];

/**
 * Configurações (Ctrl ,): everything that is not about one book, in one modal with a category sidebar.
 * Book settings live in the book drawer (Ctrl Shift S).
 */
export function SettingsModal() {
  const current = () => TABS.find((t) => t.id === state.settingsTab) ?? TABS[0];

  // ↑↓ move between categories while the sidebar has focus.
  function navKey(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    const i = TABS.findIndex((t) => t.id === state.settingsTab);
    const next = TABS[(i + (e.key === "ArrowDown" ? 1 : TABS.length - 1)) % TABS.length];
    openSettings(next.id);
    queueMicrotask(() => document.querySelector<HTMLButtonElement>(`.setm-tab[data-tab="${next.id}"]`)?.focus());
  }

  return (
    <>
      <div class="scrim" onClick={closePanel} />
      <div class="setm" role="dialog" aria-modal="true" aria-labelledby="setm-title" tabIndex={-1} ref={focusRef("settings")}>
        <nav class="setm-side" aria-label="Categorias" onKeyDown={navKey}>
          <div class="ui cap setm-brand" id="setm-title">Configurações</div>
          <For each={TABS}>
            {(t) => (
              <button
                type="button"
                class="setm-tab"
                data-tab={t.id}
                classList={{ on: t.id === current().id }}
                aria-current={t.id === current().id ? "page" : undefined}
                onClick={() => openSettings(t.id)}
              >
                <span class="setm-tab-label">{t.label}</span>
                <span class="setm-tab-hint">{t.hint}</span>
              </button>
            )}
          </For>
        </nav>
        <div class="setm-main">
          <div class="setm-head">
            <h2 class="setm-title">{current().label}</h2>
            <button type="button" class="set-close" title="Fechar (Esc)" aria-label="Fechar" onClick={closePanel}>
              <IconClose />
            </button>
          </div>
          <div class="setm-body">
            <Switch>
              <Match when={current().id === "appearance"}>
                <AppearanceSettings />
              </Match>
              <Match when={current().id === "writing"}>
                <WritingSettings />
              </Match>
              <Match when={current().id === "cloud"}>
                <CloudSettings />
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </>
  );
}
