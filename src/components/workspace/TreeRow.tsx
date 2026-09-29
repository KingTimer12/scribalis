import { Show } from "solid-js";
import { displayTitle, isContainer } from "../../lib/manuscript";
import type { Row } from "../../lib/tree";
import { openNode } from "../../store/actions/open";
import { cancelNodeRename, commitNodeRename, startNodeRename } from "../../store/actions/workspace";
import { focusTarget } from "../../store/focus";
import { setState, state } from "../../store/state";
import { consumeDragClick, drag, pointerDownOnRow } from "./dragMove";
import { NodeIcon } from "./NodeIcon";

/** DOM id of a row, for `aria-activedescendant`. */
export const rowId = (id: string) => "area-row-" + id;

function RenameField(props: { id: string }) {
  const onKey = (e: KeyboardEvent) => {
    // The tree and the global shortcuts must not see keys typed into the name.
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      focusTarget("tree");
      void commitNodeRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      focusTarget("tree");
      cancelNodeRename();
    }
  };
  return (
    <input
      class="ws-rename"
      aria-label="Nome do item"
      value={state.areaRenameVal}
      onInput={(e) => setState("areaRenameVal", e.currentTarget.value)}
      onKeyDown={onKey}
      // Enter/Esc clear `areaRenaming` first, so this only commits a real focus loss.
      onBlur={() => state.areaRenaming === props.id && void commitNodeRename()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDblClick={(e) => e.stopPropagation()}
      ref={(el) =>
        queueMicrotask(() => {
          el.focus();
          el.select();
        })
      }
      autocomplete="off"
    />
  );
}

/** One row of the workspace tree. */
export function TreeRow(props: { row: Row; onMenu: (x: number, y: number) => void }) {
  const node = () => props.row.node;
  const id = () => node().id;
  const folder = () => isContainer(node().kind);
  const expanded = () => state.areaExpanded.includes(id());
  const dropHere = () => {
    const d = drag();
    return d && d.targetId === id() ? d.pos : null;
  };

  return (
    <div
      id={rowId(id())}
      role="treeitem"
      class="ws-row"
      classList={{
        sel: state.areaSel === id(),
        open: state.areaOpen === id(),
        confirm: state.areaConfirm === id(),
        dragging: drag()?.dragId === id(),
        "drop-before": dropHere() === "before",
        "drop-after": dropHere() === "after",
        "drop-inside": dropHere() === "inside",
      }}
      data-node-id={id()}
      aria-selected={state.areaSel === id()}
      aria-expanded={folder() ? expanded() : undefined}
      aria-level={props.row.depth + 1}
      style={{ "padding-left": 8 + props.row.depth * 16 + "px" }}
      onPointerDown={(e) => pointerDownOnRow(e, id())}
      onClick={() => !consumeDragClick() && void openNode(id(), false)}
      onDblClick={() => startNodeRename(id())}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onMenu(e.clientX, e.clientY);
      }}
    >
      <span class="ws-chev" classList={{ on: expanded() }} aria-hidden="true">
        <Show when={folder()}>
          <svg viewBox="0 0 10 10">
            <path d="M3.5 2l3 3-3 3" />
          </svg>
        </Show>
      </span>
      <NodeIcon kind={node().kind} />
      <Show
        when={state.areaRenaming === id()}
        fallback={<span class="ws-t">{displayTitle(state.area, node())}</span>}
      >
        <RenameField id={id()} />
      </Show>
      {/* The chapter's file is gone from disk: Rust flags it, the row warns. */}
      <Show when={node().missing}>
        <svg class="ws-warn" viewBox="0 0 14 14" role="img" aria-label="Arquivo não encontrado">
          <title>Arquivo não encontrado</title>
          <path d="M7 1.8l5.5 9.7h-11z" />
          <path d="M7 5.6v2.6M7 9.9v.1" />
        </svg>
      </Show>
    </div>
  );
}
