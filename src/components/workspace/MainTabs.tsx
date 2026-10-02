import { Show } from "solid-js";
import { mainTab, setMainTab, type MainTab } from "../../store/actions/tabs";
import { currentChapter } from "../../store/selectors/book";
import { openDocWithSubdocs } from "../../store/selectors/board";
import { state } from "../../store/state";
import { BoardView } from "../board/BoardView";
import { Editor } from "../editor/Editor";
import { FocusExitButton } from "../editor/FocusExitButton";
import { NodeView } from "./NodeView";

function Tab(props: { tab: MainTab; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      class="ws-tab ui"
      classList={{ on: mainTab() === props.tab }}
      aria-selected={mainTab() === props.tab}
      onClick={() => setMainTab(props.tab)}
    >
      {props.label}
    </button>
  );
}

/**
 * Main pane of the book: the open chapter, text, image or file, or a folder's board. A
 * document with subdocuments adds Editor | Quadro tabs; its Quadro shows the subdocuments.
 */
export function MainTabs() {
  const boardDoc = () => (mainTab() === "board" ? openDocWithSubdocs() : null);
  return (
    <div class="ws-main-col">
      <Show when={!state.focus && openDocWithSubdocs()}>
        <div class="ws-tabs" role="tablist" aria-label="Visão">
          <Tab tab="editor" label="Editor" />
          <Tab tab="board" label="Quadro" />
        </div>
      </Show>
      <div class="ws-main" role="tabpanel">
        {/* Only hidden behind the Quadro: unmounting it would drop the open document and its pending save. */}
        <div class="ws-pane" hidden={!!boardDoc()}>
          {/* Non-keyed: moving between chapters keeps the chapter editor mounted. */}
          <Show when={currentChapter()} fallback={<NodeView />}>
            <Editor />
          </Show>
        </div>
        {/* Mounted only while shown, so placeholders load only when the Quadro is open. */}
        <Show when={boardDoc()}>{(n) => <BoardView parent={n()} />}</Show>
        {/* The only chrome that stays reachable once the rest has faded out. */}
        <Show when={state.focus}>
          <FocusExitButton />
        </Show>
      </div>
    </div>
  );
}
