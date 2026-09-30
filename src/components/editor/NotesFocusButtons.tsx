import { openPanel, toggleFocusMode } from "../../store/actions/ui";
import { state } from "../../store/state";
import { IconFocus, IconNotes } from "../ui/icons";

/** Opens the notes drawer for whatever is open (chapter or free text); shared by ChapterBar and TextView. */
export function NotesButton() {
  return (
    <button
      type="button"
      class="bar-btn"
      aria-pressed={state.panel === "notes"}
      aria-label="Notas"
      title="Notas (Ctrl ;)"
      onClick={() => openPanel("notes")}
    >
      <IconNotes size={14} />
      <span class="bar-btn-label">Notas</span>
    </button>
  );
}

/** Toggles focus mode (fades the chrome); FocusExitButton is the way back out while it is on. */
export function FocusButton() {
  return (
    <button
      type="button"
      class="bar-btn"
      aria-pressed={state.focus}
      aria-label="Foco"
      title="Modo foco (Ctrl .)"
      onClick={toggleFocusMode}
    >
      <IconFocus size={14} />
      <span class="bar-btn-label">Foco</span>
    </button>
  );
}
