import type { JSX } from "solid-js";

/** Rótulo acessível, fora da tela. */
export function SrLabel(props: { for: string; children: JSX.Element }) {
  return (
    <label for={props.for} class="sr-only-label">
      {props.children}
    </label>
  );
}
