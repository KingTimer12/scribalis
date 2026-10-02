import { For, Show } from "solid-js";
import { openBookPanel, openPanel } from "../../store/actions/ui";
import { state } from "../../store/state";
import { IconBook, IconKeyboard, IconSearch } from "../ui/icons";

const ACTIONS = [
  { label: "Comandos", title: "Comandos (Ctrl K)", Icon: IconSearch, onClick: () => openPanel("palette") },
  { label: "Atalhos", title: "Atalhos (Ctrl /)", Icon: IconKeyboard, onClick: () => openPanel("help") },
] as const;

/**
 * Top bar buttons: the palette, the shortcut map and, inside a book, its drawer (settings, backup, links).
 * Labels collapse to icons under 900px (see .bar-btn-label in global.css); `aria-label`/`title` stay so the
 * buttons are still identifiable. Configurações sits beside the theme toggle (SettingsButton).
 */
export function TopActions() {
  return (
    <div class="flex items-center gap-2">
      <Show when={state.view === "book" && state.book}>
        <button type="button" class="bar-btn" title="Esta obra: ajustes, backup e links (Ctrl Shift S)" aria-label="Obra" onClick={openBookPanel}>
          <IconBook size={16} />
          <span class="bar-btn-label">Obra</span>
        </button>
      </Show>
      <For each={ACTIONS}>
        {(a) => (
          <button type="button" class="bar-btn" title={a.title} aria-label={a.label} onClick={a.onClick}>
            <a.Icon size={16} />
            <span class="bar-btn-label">{a.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}
