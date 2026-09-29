import { Show } from "solid-js";
import { themeButton } from "../../lib/theme";
import { toggleTheme } from "../../store/actions/prefs";
import { state } from "../../store/state";

/** Sun/moon in the top bar: one click switches the theme (the same preference as Ctrl J). */
export function ThemeToggle() {
  const face = () => themeButton(state.prefs.theme);
  return (
    <button type="button" class="theme-btn" title={face().label + " (Ctrl J)"} aria-label={face().label} onClick={toggleTheme}>
      <svg viewBox="0 0 16 16" class="theme-ico" classList={{ sun: face().icon === "sun" }} aria-hidden="true">
        <Show when={face().icon === "sun"} fallback={<path d="M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8z" />}>
          <circle cx="8" cy="8" r="2.8" />
          <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
        </Show>
      </svg>
    </button>
  );
}
