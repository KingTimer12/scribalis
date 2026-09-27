import { version } from "../../../package.json";
import darkIcon from "../../assets/dark_icon.png";
import lightIcon from "../../assets/light_icon.png";
import { state } from "../../store/state";

/** App icon (matching the theme), name and the running version, at the left of the title bar. */
export function AppBrand() {
  return (
    <div class="flex items-center gap-2.5">
      <img class="app-icon" src={state.prefs.theme === "dark" ? darkIcon : lightIcon} alt="" />
      <span class="ui app-name">Scribalis</span>
      <span class="ui app-version">v{version}</span>
    </div>
  );
}
