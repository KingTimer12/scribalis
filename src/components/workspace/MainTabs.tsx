import { Show } from "solid-js";
import { mainTab, setMainTab, type MainTab } from "../../store/actions/tabs";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { BoardView } from "../board/BoardView";
import { Editor } from "../editor/Editor";
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

/** Main pane of the book: the Editor tab (open chapter, text, image, file) or the book's Quadro. */
export function MainTabs() {
  const onBoard = () => mainTab() === "board";
  return (
    <div class="ws-main-col">
      <Show when={!state.focus}>
        <div class="ws-tabs" role="tablist" aria-label="Visão">
          <Tab tab="editor" label="Editor" />
          <Tab tab="board" label="Quadro" />
        </div>
      </Show>
      <div class="ws-main" role="tabpanel">
        {/* Only hidden behind the Quadro: unmounting it would drop the open document and its pending save. */}
        <div class="ws-pane" hidden={onBoard()}>
          {/* Non-keyed: moving between chapters keeps the chapter editor mounted. */}
          <Show when={currentChapter()} fallback={<NodeView />}>
            <Editor />
          </Show>
        </div>
        {/* Mounted only while shown, so card texts load only when the Quadro is open. */}
        <Show when={onBoard()}>
          <BoardView />
        </Show>
      </div>
    </div>
  );
}
