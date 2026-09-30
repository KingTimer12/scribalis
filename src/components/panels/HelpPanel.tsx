import { For } from "solid-js";
import { SHORTCUTS } from "../../data/shortcuts";
import { focusRef } from "../../store/focus";
import { Hint } from "../ui/Hint";
import { Kbd } from "../ui/Kbd";
import { Scrim } from "../ui/Scrim";

/** Shortcut map (Ctrl /). */
export function HelpPanel() {
  return (
    <>
      <Scrim />
      <div class="help" tabIndex={-1} ref={focusRef("help")}>
        <div class="flex items-baseline justify-between">
          <div class="text-[28px] font-medium">Atalhos</div>
          <Hint keys="Esc">fechar</Hint>
        </div>
        <p class="ui help-note">Tudo aqui também tem botão ou menu; os atalhos são opcionais.</p>
        <div class="grid grid-cols-2 gap-x-10">
          <For each={SHORTCUTS}>
            {(s) => {
              const row = (
                <>
                  <span>{s.label}</span>
                  <span class="flex gap-1">
                    <For each={s.keys}>{(k) => <Kbd>{k}</Kbd>}</For>
                  </span>
                </>
              );
              // A row with a `run` action can be triggered from here; the rest are shortcut-only.
              return s.run ? (
                <button type="button" class="help-row help-row-btn" onClick={s.run}>
                  {row}
                </button>
              ) : (
                <div class="help-row">{row}</div>
              );
            }}
          </For>
        </div>
      </div>
    </>
  );
}
