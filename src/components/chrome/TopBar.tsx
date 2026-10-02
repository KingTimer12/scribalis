import { Show } from "solid-js";
import { isTauri } from "../../api/invoke";
import { isMac } from "../../lib/platform";
import { setBookTitle } from "../../store/actions/book";
import { goLibrary } from "../../store/actions/library";
import { focusRef } from "../../store/focus";
import { bookTitleKey } from "../../store/keys/fields";
import { state } from "../../store/state";
import { SrLabel } from "../ui/SrLabel";
import { AppBrand } from "./AppBrand";
import { BookTabs } from "./BookTabs";
import { ThemeToggle } from "./ThemeToggle";
import { TopActions } from "./TopActions";
import { UpdateBadge } from "./UpdateBadge";
import { WindowControls } from "./WindowControls";

/** Custom buttons everywhere but macOS, whose native traffic lights stay. */
const ownButtons = isTauri && !isMac;
/** Room on the left for the macOS traffic lights. */
const leftPad = isTauri && isMac ? "pl-[92px]" : "pl-9";

/** Also the window's title bar: empty areas drag the window, double-click maximizes. */
export function TopBar() {
  return (
    <header
      class={`chrome absolute inset-x-0 top-0 flex h-16 items-center justify-between ${leftPad} ${ownButtons ? "pr-3" : "pr-9"}`}
      data-tauri-drag-region="deep"
    >
      <div class="flex items-center gap-2.5">
        <AppBrand />
        <Show when={state.view !== "library" && !!state.book}>
          <span class="brand-rule" aria-hidden="true" />
          <button class="ui crumb" onClick={goLibrary}>
            Obras
          </button>
          <span class="ui opacity-50">/</span>
          <SrLabel for="book-title">Nome da obra</SrLabel>
          <input
            id="book-title"
            class="ui book"
            value={state.book?.title ?? ""}
            onInput={(e) => setBookTitle(e.currentTarget.value)}
            onKeyDown={bookTitleKey}
            ref={focusRef("book")}
            placeholder="Nome da obra"
            autocomplete="off"
          />
          <BookTabs />
        </Show>
      </div>
      <div class="flex items-center gap-[18px]">
        <ThemeToggle />
        <UpdateBadge />
        <TopActions />
        <Show when={ownButtons}>
          <WindowControls />
        </Show>
      </div>
    </header>
  );
}
