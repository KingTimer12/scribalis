import { openSettings } from "../../store/actions/ui";
import { IconSettings } from "../ui/icons";

/** Gear beside the theme toggle: opens the Configurações modal (Ctrl ,). */
export function SettingsButton() {
  return (
    <button type="button" class="theme-btn" title="Configurações (Ctrl ,)" aria-label="Configurações" onClick={() => openSettings()}>
      <IconSettings size={16} />
    </button>
  );
}
