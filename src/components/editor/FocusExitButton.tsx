import { createSignal, onCleanup, onMount } from "solid-js";
import { toggleFocusMode } from "../../store/actions/ui";
import { IconFocus } from "../ui/icons";

const HIDE_AFTER_MS = 2000;

/**
 * Floating "Sair do foco" button over the writing area, for when the rest of the chrome has
 * faded out. Shows on mouse move or keyboard focus, fades again after 2s of no movement. Under
 * `prefers-reduced-motion` the CSS (.focus-exit, global.css) keeps it always shown and static
 * instead, so this component does not need to know about that preference. Esc keeps working as
 * the global shortcut.
 */
export function FocusExitButton() {
  const [show, setShow] = createSignal(true);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const wake = () => {
    setShow(true);
    clearTimeout(timer);
    timer = setTimeout(() => setShow(false), HIDE_AFTER_MS);
  };

  onMount(() => {
    wake();
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("focusin", wake);
  });
  onCleanup(() => {
    clearTimeout(timer);
    window.removeEventListener("mousemove", wake);
    window.removeEventListener("keydown", wake);
    window.removeEventListener("focusin", wake);
  });

  return (
    <button
      type="button"
      class="bar-btn focus-exit"
      classList={{ show: show() }}
      aria-label="Sair do foco"
      title="Sair do modo foco (Esc)"
      onClick={toggleFocusMode}
    >
      <IconFocus size={14} />
      <span class="bar-btn-label">Sair do foco</span>
    </button>
  );
}
