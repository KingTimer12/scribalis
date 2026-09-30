import { createEffect, createSignal, Show } from "solid-js";
import { bookAsset } from "../../lib/assets";
import { setBookAuthor } from "../../store/actions/book";
import { changeBookCover, changeSeparatorText, removeBookCover } from "../../store/actions/bookSettings";
import { clearBookImage, pickBookImage } from "../../store/actions/images";
import { state } from "../../store/state";
import { CoverArt } from "../library/CoverArt";

/** Author, saved on blur/Enter like a rename field; the store only gets patched when the value actually changed. */
function AuthorRow() {
  const [value, setValue] = createSignal(state.book?.author ?? "");
  // Resyncs the field if the author changes from elsewhere (the palette prompt, another device after a reload).
  createEffect(() => setValue(state.book?.author ?? ""));

  function commit() {
    const v = value().trim();
    if (v !== (state.book?.author ?? "")) setBookAuthor(v);
  }

  return (
    <div class="set-group">
      <label class="set-label" for="set-author">Autor</label>
      <input
        id="set-author"
        class="set-input"
        value={value()}
        placeholder="Nome do autor"
        onInput={(e) => setValue(e.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </div>
  );
}

/** Cover thumbnail, reusing the library's tile art (image, or the title's first letter). */
function CoverRow() {
  const book = () => state.book!;
  const src = () => bookAsset(book().dir, book().cover, book().updatedAt);

  return (
    <div class="set-group">
      <span class="set-label">Capa</span>
      <div class="set-book-row">
        <div class="set-thumb set-thumb-cover">
          <CoverArt id={book().id} title={book().title} cover={src()} />
        </div>
        <div class="set-actions">
          <button type="button" class="set-btn" onClick={() => void changeBookCover()}>Escolher…</button>
          <Show when={book().cover}>
            <button type="button" class="set-btn" onClick={() => void removeBookCover()}>Remover</button>
          </Show>
        </div>
      </div>
    </div>
  );
}

/** Scene separator: current text, or the image it was switched to; the same three palette actions. */
function SeparatorRow() {
  const sep = () => state.book!.separator;
  const isImage = () => sep().type === "image";
  const text = () => {
    const s = sep();
    return s.type === "text" ? s.text : "* * *";
  };
  const imgSrc = () => {
    const s = sep();
    return s.type === "image" ? bookAsset(state.book!.dir, s.image, state.book!.updatedAt) : null;
  };

  return (
    <div class="set-group">
      <span class="set-label">Separador de cena</span>
      <div class="set-book-row">
        <div class="set-thumb">
          <Show when={isImage()} fallback={<span class="set-thumb-empty">{text()}</span>}>
            <Show when={imgSrc()} fallback={<span class="set-thumb-empty">Imagem</span>}>
              {(u) => <img src={u()} alt="" />}
            </Show>
          </Show>
        </div>
        <div class="set-actions">
          <button type="button" class="set-btn" onClick={changeSeparatorText}>Mudar texto…</button>
          <button type="button" class="set-btn" onClick={() => void pickBookImage("separator")}>Escolher imagem…</button>
          <Show when={isImage()}>
            <button type="button" class="set-btn" onClick={() => void clearBookImage("separator")}>Remover imagem</button>
          </Show>
        </div>
      </div>
    </div>
  );
}

/** Top/bottom frame image, shown outside the editable text (see BookImage.tsx in the editor). */
function FrameRow(props: { label: string; slot: "header" | "footer" }) {
  const book = () => state.book!;
  const path = () => book()[props.slot];
  const src = () => bookAsset(book().dir, path(), book().updatedAt);

  return (
    <div class="set-group">
      <span class="set-label">{props.label}</span>
      <div class="set-book-row">
        <div class="set-thumb">
          <Show when={src()} fallback={<span class="set-thumb-empty">Nenhuma</span>}>
            {(u) => <img src={u()} alt="" />}
          </Show>
        </div>
        <div class="set-actions">
          <button type="button" class="set-btn" onClick={() => void pickBookImage(props.slot)}>Escolher…</button>
          <Show when={path()}>
            <button type="button" class="set-btn" onClick={() => void clearBookImage(props.slot)}>Remover</button>
          </Show>
        </div>
      </div>
    </div>
  );
}

/** Ajustes section for the open book: author, cover, scene separator, top/bottom frames — same actions as the palette. */
export function BookSettings() {
  return (
    <section class="set-sec">
      <div class="ui cap set-head">Obra</div>
      <AuthorRow />
      <CoverRow />
      <SeparatorRow />
      <FrameRow label="Moldura superior" slot="header" />
      <FrameRow label="Moldura inferior" slot="footer" />
    </section>
  );
}
