import type { JSX } from "solid-js";

/** Accessible off-screen label. */
export function SrLabel(props: { for: string; children: JSX.Element }) {
  return (
    <label for={props.for} class="sr-only-label">
      {props.children}
    </label>
  );
}
