import { Show } from "solid-js";
import { bookTitleKey, setBookTitle } from "../../store/chapters";
import { focusRef } from "../../store/focus";
import { goLibrary } from "../../store/library";
import { currentBook, state } from "../../store/state";
import { Hint } from "../ui/Hint";
import { SrLabel } from "../ui/SrLabel";

export function TopBar() {
  return (
    <header class="chrome absolute inset-x-0 top-0 flex h-16 items-center justify-between px-9">
      <div class="flex items-center gap-2.5">
        <Show when={state.view === "editor"}>
          <button class="ui crumb" onClick={goLibrary}>
            Obras
          </button>
          <span class="ui opacity-50">/</span>
          <SrLabel for="book-title">Nome da obra</SrLabel>
          <input
            id="book-title"
            class="ui book"
            value={currentBook()?.title ?? ""}
            onInput={(e) => setBookTitle(e.currentTarget.value)}
            onKeyDown={bookTitleKey}
            ref={focusRef("book")}
            placeholder="Nome da obra"
            autocomplete="off"
          />
        </Show>
      </div>
      <div class="flex items-center gap-[18px]">
        <Hint keys="Ctrl K">comandos</Hint>
        <Hint keys="Ctrl /">atalhos</Hint>
      </div>
    </header>
  );
}
