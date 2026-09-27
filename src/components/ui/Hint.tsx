import type { JSX } from "solid-js";
import { Kbd } from "./Kbd";

/** Key + label, e.g. [Ctrl K] comandos */
export function Hint(props: { keys: string; children: JSX.Element }) {
  return (
    <span class="ui hint">
      <Kbd>{props.keys}</Kbd>
      {props.children}
    </span>
  );
}
