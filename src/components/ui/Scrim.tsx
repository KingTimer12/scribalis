import { closePanel } from "../../store/actions/ui";

/** Dimmed backdrop behind panels; click closes. */
export function Scrim() {
  return <div class="scrim" onClick={closePanel} />;
}
