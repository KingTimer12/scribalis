import { closePanel } from "../../store/ui";

/** Dimmed backdrop behind panels; click closes. */
export function Scrim() {
  return <div class="scrim" onClick={closePanel} />;
}
