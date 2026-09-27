import { Show } from "solid-js";
import { bookAsset } from "../../lib/assets";
import { state } from "../../store/state";

/** Header or footer image of the open book, outside the editable text. */
export function BookImage(props: { slot: "header" | "footer" }) {
  const src = () => {
    const b = state.book;
    return b ? bookAsset(b.dir, b[props.slot], b.updatedAt) : null;
  };
  return (
    <Show when={src()}>
      {(url) => <img class={"book-img book-" + props.slot} src={url()} alt="" />}
    </Show>
  );
}
