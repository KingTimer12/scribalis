import { setBookTab } from "../../store/actions/sheets";
import { state } from "../../store/state";

function Tab(props: { tab: "write" | "sheets"; label: string; hint: string }) {
  const on = () => state.bookTab === props.tab;
  return (
    <button
      type="button"
      role="tab"
      class="book-tab ui"
      classList={{ on: on() }}
      aria-selected={on()}
      title={props.hint}
      onClick={() => void setBookTab(props.tab)}
    >
      {props.label}
    </button>
  );
}

/** Sections of the open book: the writing (tree and editor) and the sheets of the whole book. */
export function BookTabs() {
  return (
    <div class="book-tabs" role="tablist" aria-label="Seção da obra">
      <Tab tab="write" label="Escrita" hint="Escrita (Ctrl Shift F alterna)" />
      <Tab tab="sheets" label="Fichas" hint="Personagens e lugares (Ctrl Shift F)" />
    </div>
  );
}
