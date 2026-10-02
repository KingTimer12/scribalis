import { Show } from "solid-js";
import { openBookPanel } from "../../store/actions/ui";
import { state } from "../../store/state";

const time = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Short cloud state of the open book; click opens the cloud drawer. */
export function CloudIndicator() {
  const status = () => (state.cloudStatus?.bookId === state.book?.id ? state.cloudStatus : null);
  const label = () => {
    const s = status();
    if (s?.state === "sending") return "nuvem ↑";
    if (s?.state === "offline") return "nuvem offline";
    if (s?.state === "error") return "nuvem: " + (s.message ?? "erro");
    const at = s?.lastBackupAt ?? state.cloudBook?.lastBackupAt;
    return at ? "nuvem ✓ " + time(at) : "nuvem";
  };
  return (
    <Show when={state.cloudBook?.enabled}>
      <button class="ui crumb" title="Nuvem (Ctrl Shift S)" onClick={() => openBookPanel()}>
        {label()}
      </button>
    </Show>
  );
}
