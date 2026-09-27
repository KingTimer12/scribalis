import type { Status } from "../../lib/types";

export function StatusDot(props: { status: Status }) {
  return <span class={"dot st-" + props.status} />;
}
