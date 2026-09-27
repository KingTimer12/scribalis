import { focusTarget } from "../focus";
import { setState } from "../state";

/** Turns the open palette into a single text field; Enter submits, Esc cancels. */
export function promptFor(label: string, initial: string, submit: (value: string) => void) {
  focusTarget("palette", "end");
  setState({ panel: "palette", prompt: { label, value: initial, submit }, q: "" });
}
