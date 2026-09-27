import { Show } from "solid-js";
import { ago, bookWords, fmt } from "../../lib/format";
import type { Book } from "../../lib/types";
import { openBook } from "../../store/library";
import { state } from "../../store/state";
import { CoverArt } from "./CoverArt";
import { RenameInput } from "./RenameInput";

export function BookTile(props: { book: Book; selected: boolean }) {
  const title = () => props.book.title || "Obra sem título";
  const renaming = () => state.renaming === props.book.id;
  const confirming = () => state.libConfirm === props.book.id;
  const meta = () => {
    const b = props.book;
    const done = b.chapters.filter((c) => c.status === "pronto").length;
    return (
      fmt(b.chapters.length) + " cap. · " + fmt(bookWords(b)) + " pal. · " + fmt(done) + (done === 1 ? " pronto" : " prontos")
    );
  };

  return (
    <div class="tile" classList={{ sel: props.selected, cur: props.book.id === state.curId }}>
      <button class="cover-btn" onClick={() => openBook(props.book.id)} aria-label={"Abrir " + title()}>
        <CoverArt id={props.book.id} title={props.book.title} cover={props.book.cover} />
      </button>
      <Show
        when={!renaming()}
        fallback={<RenameInput label="Novo nome da obra" />}
      >
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
