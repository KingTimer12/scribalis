import { closePanel } from "../../store/ui";

/** Fundo escurecido atrás dos painéis; clique fecha. */
export function Scrim() {
  return <div class="scrim" onClick={closePanel} />;
}
