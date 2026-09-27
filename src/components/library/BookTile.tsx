import { Show } from "solid-js";
import type { BookSummary } from "../../api/types";
import { fileAsset } from "../../lib/assets";
import { ago, fmt } from "../../lib/format";
import { openBook } from "../../store/actions/library";
import { state } from "../../store/state";
import { CoverArt } from "./CoverArt";
import { RenameInput } from "./RenameInput";

export function BookTile(props: { book: BookSummary; selected: boolean }) {
  const title = () => props.book.title || "Obra sem título";
  const renaming = () => state.renaming === props.book.id;
  const confirming = () => state.libConfirm === props.book.id;
  const meta = () => {
    const b = props.book;
    return fmt(b.chapters) + " cap. · " + fmt(b.words) + " pal. · " + fmt(b.ready) + (b.ready === 1 ? " pronto" : " prontos");
  };

  return (
    <div class="tile" classList={{ sel: props.selected, cur: props.book.id === state.curId }}>
      <button class="cover-btn" onClick={() => openBook(props.book.id)} aria-label={"Abrir " + title()}>
        <CoverArt id={props.book.id} title={props.book.title} cover={fileAsset(props.book.cover, props.book.updatedAt)} />
      </button>
      <Show when={!renaming()} fallback={<RenameInput label="Novo nome da obra" />}>
        <div class="flex flex-col gap-1.5">
          <div class="tile-title">{title()}</div>
          <Show
            when={confirming()}
            fallback={
              <div class="ui leading-normal">
                {meta()}
                <br />
                editada {ago(props.book.updatedAt)}
              </div>
            }
          >
            <div class="ui warn leading-normal">Del de novo exclui · Esc cancela</div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
