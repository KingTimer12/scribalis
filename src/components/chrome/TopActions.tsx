import { For } from "solid-js";
import { openPanel } from "../../store/actions/ui";
import { IconKeyboard, IconSearch, IconSettings } from "../ui/icons";

const ACTIONS = [
  { label: "Comandos", title: "Comandos (Ctrl K)", Icon: IconSearch, onClick: () => openPanel("palette") },
  { label: "Atalhos", title: "Atalhos (Ctrl /)", Icon: IconKeyboard, onClick: () => openPanel("help") },
  { label: "Ajustes", title: "Ajustes (Ctrl ,)", Icon: IconSettings, onClick: () => openPanel("settings") },
] as const;

/**
 * Top bar buttons replacing the old keys-only hints: open the palette, the shortcut
 * map and the Ajustes drawer. Labels collapse to icons under 900px (see .bar-btn-label
 * in global.css); `aria-label`/`title` stay so the buttons are still identifiable.
 */
export function TopActions() {
  return (
    <div class="flex items-center gap-2">
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
