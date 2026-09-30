import { Show } from "solid-js";
import type { BookSummary } from "../../api/types";
import { fileAsset } from "../../lib/assets";
import { ago, fmt } from "../../lib/format";
import { openBook } from "../../store/actions/library";
import { state } from "../../store/state";
import { IconMore } from "../ui/icons";
import { CoverArt } from "./CoverArt";
import { RenameInput } from "./RenameInput";

export function BookTile(props: { book: BookSummary; selected: boolean; onMenu: (x: number, y: number) => void }) {
  const title = () => props.book.title || "Obra sem título";
  const renaming = () => state.renaming === props.book.id;
  const meta = () => {
    const b = props.book;
    return fmt(b.chapters) + " cap. · " + fmt(b.words) + " pal. · " + fmt(b.ready) + (b.ready === 1 ? " pronto" : " prontos");
  };

  return (
    <div
      class="tile"
      classList={{ sel: props.selected, cur: props.book.id === state.curId }}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onMenu(e.clientX, e.clientY);
      }}
    >
      <button class="cover-btn" onClick={() => openBook(props.book.id)} aria-label={"Abrir " + title()}>
        <CoverArt id={props.book.id} title={props.book.title} cover={fileAsset(props.book.cover, props.book.updatedAt)} />
        <Show when={props.book.cloud}>
          <span class="cloud-badge" aria-label="Guardada na nuvem">Nuvem</span>
        </Show>
      </button>
      {/* Own pointerdown/click stay local: it must not open the book or break the grid's arrow keys. */}
      <button
        type="button"
        class="icon-btn tile-more"
        aria-label={"Mais ações de " + title()}
        title="Mais ações"
        aria-haspopup="menu"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          props.onMenu(r.left, r.bottom + 4);
        }}
      >
        <IconMore size={14} />
      </button>
      <Show when={!renaming()} fallback={<RenameInput label="Novo nome da obra" />}>
        <div class="flex flex-col gap-1.5">
          <div class="tile-title">{title()}</div>
          <div class="ui leading-normal">
            {meta()}
            <br />
            editada {ago(props.book.updatedAt)}
          </div>
        </div>
      </Show>
    </div>
  );
}
