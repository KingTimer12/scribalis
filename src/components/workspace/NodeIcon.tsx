import { Match, Switch } from "solid-js";
import type { NodeKind } from "../../api/types";

/** Stroke icons in the style of the toolbar buttons, one per node kind. */
export function NodeIcon(props: { kind: NodeKind }) {
  return (
    <svg class="ws-icon" viewBox="0 0 14 14" aria-hidden="true">
      <Switch>
        <Match when={props.kind === "folder"}>
          <path d="M1.5 3.5h4l1.2 1.4h5.8v6.6h-11z" />
        </Match>
        <Match when={props.kind === "text"}>
          <path d="M3 1.5h5.5l2.5 2.5v8.5h-8z" />
          <path d="M5 6.5h4M5 8.5h4M5 10.5h2.5" />
        </Match>
        <Match when={props.kind === "image"}>
          <rect x="1.5" y="2.5" width="11" height="9" rx="1" />
          <path d="M1.5 10l3.2-3.2 2.6 2.6 1.7-1.7 3.5 3.5" />
          <circle cx="9.5" cy="5.2" r="0.9" />
        </Match>
        <Match when={props.kind === "file"}>
          <path d="M3 1.5h5.5l2.5 2.5v8.5h-8z" />
          <path d="M8.5 1.5v2.5h2.5" />
        </Match>
      </Switch>
    </svg>
  );
}
