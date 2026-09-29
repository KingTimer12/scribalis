import { createEffect, on, onCleanup, Show } from "solid-js";
import { answerConfirm, pendingConfirm } from "../../store/confirm";

/** Modal "are you sure?" dialog; rendered once at the app root and driven by `askConfirm`. */
export function ConfirmDialog() {
  let cancelBtn: HTMLButtonElement | undefined;
  let confirmBtn: HTMLButtonElement | undefined;
  let previous: HTMLElement | null = null;

  // Focus goes to the safe button on open and returns to the previous element on close.
  createEffect(
    on(
      () => !!pendingConfirm(),
      (open) => {
        if (!open) return;
        previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        queueMicrotask(() => cancelBtn?.focus());
        onCleanup(() => previous?.isConnected && previous.focus());
      },
    ),
  );

  // Capture phase: the dialog owns the keyboard while it is open.
  const onKey = (e: KeyboardEvent) => {
    if (!pendingConfirm()) return;
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      answerConfirm(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      const first = e.shiftKey ? confirmBtn : cancelBtn;
      const second = e.shiftKey ? cancelBtn : confirmBtn;
      (document.activeElement === first ? second : first)?.focus();
    }
  };
  window.addEventListener("keydown", onKey, true);
  onCleanup(() => window.removeEventListener("keydown", onKey, true));

  return (
    <Show when={pendingConfirm()}>
      {(p) => (
        <>
          <div class="scrim" onClick={() => answerConfirm(false)} />
          <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">
            <div class="confirm-title" id="confirm-title">{p().title}</div>
            <div class="confirm-msg" id="confirm-msg">{p().message}</div>
            <div class="confirm-actions">
              <button type="button" class="confirm-btn" ref={cancelBtn} onClick={() => answerConfirm(false)}>Cancelar</button>
              <button type="button" class="confirm-btn" classList={{ danger: !!p().danger }} ref={confirmBtn} onClick={() => answerConfirm(true)}>
                {p().confirmLabel}
              </button>
            </div>
          </div>
        </>
      )}
    </Show>
  );
}
