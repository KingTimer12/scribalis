import { Show } from "solid-js";
import { coverLetter, coverTone } from "../../lib/cover";

/** Conteúdo da capa: imagem, ou a primeira letra sobre um tom derivado do id. */
export function CoverArt(props: { id: string; title: string; cover?: string | null }) {
  return (
    <Show
      when={props.cover}
      fallback={<span class={"cover-letter cov-" + coverTone(props.id)}>{coverLetter(props.title)}</span>}
    >
      {(src) => <img class="cover-img" src={src()} alt="" />}
    </Show>
  );
}
