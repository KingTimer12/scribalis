import { Show } from "solid-js";
import { sidebarOpen, toggleSidebar } from "../../store/actions/sidebar";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { Editor } from "../editor/Editor";
import { NodeView } from "./NodeView";
import { SidebarFoot } from "./SidebarFoot";
import { WorkspaceTree } from "./WorkspaceTree";

/** Collapsed sidebar: a thin rail whose » reopens the tree. */
function Rail() {
  return (
    <aside class="ws-rail chrome">
      <button type="button" class="ui crumb" title="Mostrar a árvore (Ctrl E)" aria-label="Mostrar a árvore" onClick={toggleSidebar}>
        »
      </button>
    </aside>
  );
}

/** The book screen: the tree on the left, the open chapter (or text, image, attachment) on the right. */
export function Workspace() {
  return (
    <div class="absolute inset-x-0 top-16 bottom-16 flex">
      {/* Focus mode removes the sidebar and its rail entirely (no width, no hover reappear). */}
      <Show when={!state.focus}>
        <Show when={sidebarOpen()} fallback={<Rail />}>
          <aside class="ws-side chrome">
            <WorkspaceTree />
            <SidebarFoot />
          </aside>
        </Show>
      </Show>
      <div class="ws-main">
        {/* Non-keyed: moving between chapters keeps the chapter editor mounted. */}
        <Show when={currentChapter()} fallback={<NodeView />}>
          <Editor />
        </Show>
      </div>
    </div>
  );
}
