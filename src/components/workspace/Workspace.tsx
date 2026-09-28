import { For } from "solid-js";
import { visibleRows } from "../../lib/tree";
import { openNode } from "../../store/actions/workspace";
import { focusRef } from "../../store/focus";
import { state } from "../../store/state";
import { NodeView } from "./NodeView";

/** Temporary read-only listing of the tree; the interactive tree replaces it. */
function TreeList() {
  const rows = () => visibleRows(state.area, new Set(state.areaExpanded));
  return (
    <div class="ws-tree" role="tree" aria-label="Área de trabalho" tabIndex={0} ref={focusRef("tree")}>
      <For each={rows()}>
        {(r) => (
          <div
            role="treeitem"
            class="ws-row"
            classList={{ sel: state.areaSel === r.node.id, open: state.areaOpen === r.node.id }}
            aria-selected={state.areaSel === r.node.id}
            aria-expanded={r.node.kind === "folder" ? state.areaExpanded.includes(r.node.id) : undefined}
            style={{ "padding-left": 12 + r.depth * 16 + "px" }}
            onClick={() => openNode(r.node.id)}
          >
            {r.node.title}
          </div>
        )}
      </For>
    </div>
  );
}

/** "Área de trabalho" tab: the tree on the left, the open item on the right. */
export function Workspace() {
  return (
    <div class="absolute inset-x-0 top-16 bottom-16 flex">
      <aside class="ws-side chrome">
        <TreeList />
      </aside>
      <div class="ws-main">
        <NodeView />
      </div>
    </div>
  );
}
