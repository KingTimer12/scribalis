import { NodeView } from "./NodeView";
import { WorkspaceTree } from "./WorkspaceTree";

/** "Área de trabalho" tab: the tree on the left, the open item on the right. */
export function Workspace() {
  return (
    <div class="absolute inset-x-0 top-16 bottom-16 flex">
      <aside class="ws-side chrome">
        <WorkspaceTree />
      </aside>
      <div class="ws-main">
        <NodeView />
      </div>
    </div>
  );
}
