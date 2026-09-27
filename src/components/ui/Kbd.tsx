import type { JSX } from "solid-js";

export function Kbd(props: { children: JSX.Element; class?: string }) {
  return <span class={"kbd " + (props.class ?? "")}>{props.children}</span>;
}
