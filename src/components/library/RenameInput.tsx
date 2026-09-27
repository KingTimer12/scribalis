import { focusRef } from "../../store/focus";
import { renameKey } from "../../store/library";
import { setState, state } from "../../store/state";

/** Campo inline para nomear/renomear obra. Enter confirma, Esc cancela. */
export function RenameInput(props: { id?: string; label: string; placeholder?: string }) {
  return (
    <input
      id={props.id}
      class="lib-rename"
      aria-label={props.id ? undefined : props.label}
      value={state.renameVal}
      onInput={(e) => setState("renameVal", e.currentTarget.value)}
      onKeyDown={renameKey}
      ref={focusRef("rename")}
      placeholder={props.placeholder}
      autocomplete="off"
    />
  );
}
