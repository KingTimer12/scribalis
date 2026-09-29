import { Show } from "solid-js";
import { currentChapter } from "../../store/selectors/book";
import { Editor } from "../editor/Editor";
import { NodeView } from "./NodeView";
import { WorkspaceTree } from "./WorkspaceTree";

/** The book screen: the tree on the left, the open chapter (or text, image, attachment) on the right. */
export function Workspace() {
  return (
    <div class="absolute inset-x-0 top-16 bottom-16 flex">
      <aside class="ws-side chrome">
        <WorkspaceTree />
      </aside>
      <div class="ws-main">
        {/* Non-keyed: moving between chapters keeps the chapter editor mounted. */}
        <Show when={currentChapter()} fallback={<NodeView />}>
          <Editor />
        </Show>
      </div>
    </div>
  );
}
