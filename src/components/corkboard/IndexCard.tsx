import { createSignal, Show } from "solid-js";
import type { AreaNode } from "../../api/types";
import { bookAsset } from "../../lib/assets";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { fmt, plural } from "../../lib/format";
import { displayTitle } from "../../lib/manuscript";
import { openNode, selectNode } from "../../store/actions/open";
import { flushSynopsis, scheduleSynopsis } from "../../store/actions/synopsis";
import { focusTarget } from "../../store/focus";
import { state } from "../../store/state";
import { StatusDot } from "../ui/StatusDot";
import { MissingIcon } from "../workspace/MissingIcon";
import { NodeIcon } from "../workspace/NodeIcon";
import { cardDrag, consumeCardClick, pointerDownOnCard } from "./cardDrag";

/** DOM id of a card, for `aria-activedescendant`. */
export const cardId = (id: string) => "card-" + id;

const stop = (e: Event) => e.stopPropagation();

/** The synopsis, edited in place; an image without one shows its thumbnail until clicked. */
function Synopsis(props: { node: AreaNode }) {
  let field: HTMLTextAreaElement | undefined;
  const [editing, setEditing] = createSignal(false);
  const thumb = () => {
    const n = props.node;
    if (n.kind !== "image" || n.synopsis || editing() || !state.book || !n.file) return null;
    return bookAsset(state.book.dir, "area/" + n.file, 0);
  };
  const onKey = (e: KeyboardEvent) => {
    // The board, the tree and the global shortcuts must not see keys typed into the synopsis.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      focusTarget("board");
    }
  };
  return (
    <Show
      when={thumb()}
      fallback={
        <textarea
          ref={field}
          class="card-syn"
          aria-label="Sinopse"
          value={props.node.synopsis ?? ""}
          maxlength={SYNOPSIS_MAX}
          placeholder="Escreva uma sinopse…"
          onInput={(e) => scheduleSynopsis(props.node.id, e.currentTarget.value)}
          onFocus={() => selectNode(props.node.id)}
          onBlur={() => {
            setEditing(false);
            void flushSynopsis();
          }}
          onKeyDown={onKey}
          // Pressing inside the text edits it: no card drag, click or open.
          onPointerDown={stop}
          onClick={stop}
          onDblClick={stop}
        />
      }
    >
      {(url) => (
        <button
          type="button"
          class="card-thumb"
          aria-label="Escrever uma sinopse"
          onClick={(e) => {
            e.stopPropagation();
            if (consumeCardClick()) return;
            setEditing(true);
            queueMicrotask(() => field?.focus());
          }}
        >
          <img src={url()} alt="" />
        </button>
      )}
    </Show>
  );
}

/** One child of the board's folder: icon, title, synopsis and a footer by kind. */
export function IndexCard(props: { node: AreaNode; onMenu: (x: number, y: number) => void }) {
  const node = () => props.node;
  const id = () => node().id;
  const dropHere = () => {
    const d = cardDrag();
    return d && d.targetId === id() ? d.pos : null;
  };
  return (
    <div
      id={cardId(id())}
      role="option"
      class="card"
      classList={{
        sel: state.areaSel === id(),
        dragging: cardDrag()?.dragId === id(),
        "drop-before": dropHere() === "before",
        "drop-after": dropHere() === "after",
      }}
      aria-selected={state.areaSel === id()}
      data-card-id={id()}
      onPointerDown={(e) => pointerDownOnCard(e, id())}
      onClick={() => {
        if (consumeCardClick()) return;
        selectNode(id());
        focusTarget("board");
      }}
      onDblClick={() => void openNode(id())}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onMenu(e.clientX, e.clientY);
      }}
    >
      <div class="card-head">
        <NodeIcon kind={node().kind} />
        <span class="card-t">{displayTitle(state.area, node())}</span>
        <Show when={node().missing}>
          <MissingIcon />
        </Show>
      </div>
      <Synopsis node={node()} />
      <div class="card-foot ui">
        <Show when={node().kind === "chapter"}>
          <StatusDot status={node().status ?? "rascunho"} />
          <span>{fmt(node().words ?? 0)} palavras</span>
        </Show>
        <Show when={node().kind === "folder"}>
          <span>{plural(node().children?.length ?? 0, "item", "itens")}</span>
        </Show>
      </div>
    </div>
  );
}
