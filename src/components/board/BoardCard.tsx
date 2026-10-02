import { Show } from "solid-js";
import type { AreaNode } from "../../api/types";
import { SYNOPSIS_MAX } from "../../lib/constants";
import { fmt, plural } from "../../lib/format";
import { displayTitle } from "../../lib/manuscript";
import { isFolder } from "../../lib/tree";
import { selectCard } from "../../store/actions/board";
import { flushCardTitle, scheduleCardTitle } from "../../store/actions/cardTitle";
import { openNode } from "../../store/actions/open";
import { flushSynopsis, scheduleSynopsis } from "../../store/actions/synopsis";
import { focusTarget } from "../../store/focus";
import { cardFieldKey } from "../../store/keys/cardField";
import { state } from "../../store/state";
import { StatusDot } from "../ui/StatusDot";
import { NodeIcon } from "../workspace/NodeIcon";
import { cardKindLabel } from "./boardMenu";
import { cardDrag, consumeCardClick, pointerDownOnCard } from "./cardDrag";

export const cardDomId = (id: string) => "bcard-" + id;
export const cardTitleId = (id: string) => "bcard-title-" + id;
export const cardTextId = (id: string) => "bcard-text-" + id;

const stop = (e: Event) => e.stopPropagation();

/** What is inside a card's node, for its foot: "3 subdocumentos", "2 itens"… */
function inside(node: AreaNode): string {
  const n = node.children?.length ?? 0;
  if (isFolder(node.kind)) return plural(n, "item", "itens");
  return n ? plural(n, "subdocumento", "subdocumentos") : "";
}

/**
 * One index card for a child of the board's node: its title over a red line and its synopsis
 * on the rules. Without a synopsis, the opening of the document shows as the placeholder.
 */
export function BoardCard(props: {
  parent: string;
  node: AreaNode;
  onMenu: (x: number, y: number) => void;
  onEditText: (id: string) => void;
}) {
  const id = () => props.node.id;
  const dropHere = () => {
    const d = cardDrag();
    return d && d.targetId === id() ? d.pos : null;
  };
  const back = () => focusTarget("board");
  const placeholder = () => state.boardExcerpts[id()] ?? "Escreva uma sinopse…";
  return (
    <div
      id={cardDomId(id())}
      role="option"
      class="bcard"
      classList={{
        sel: state.boardSel === id(),
        dragging: cardDrag()?.dragId === id(),
        "drop-before": dropHere() === "before",
        "drop-after": dropHere() === "after",
      }}
      aria-selected={state.boardSel === id()}
      data-card-id={id()}
      title="Duplo clique para abrir"
      onPointerDown={(e) => pointerDownOnCard(e, props.parent, id())}
      onClick={() => {
        if (consumeCardClick()) return;
        selectCard(id());
        focusTarget("board");
      }}
      onDblClick={() => void openNode(id())}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        selectCard(id());
        props.onMenu(e.clientX, e.clientY);
      }}
    >
      <input
        id={cardTitleId(id())}
        class="bcard-title"
        aria-label="Título"
        // An untitled chapter goes by its number, like in the tree.
        placeholder={props.node.kind === "chapter" ? displayTitle(state.area, props.node) : "Sem título"}
        value={props.node.title}
        onInput={(e) => scheduleCardTitle(id(), e.currentTarget.value)}
        onFocus={() => selectCard(id())}
        onBlur={() => void flushCardTitle()}
        onKeyDown={(e) => cardFieldKey(e, back, () => props.onEditText(id()))}
        onPointerDown={stop}
        onClick={stop}
        onDblClick={stop}
        autocomplete="off"
      />
      <textarea
        id={cardTextId(id())}
        class="bcard-text"
        aria-label="Sinopse"
        placeholder={placeholder()}
        value={props.node.synopsis ?? ""}
        maxLength={SYNOPSIS_MAX}
        onInput={(e) => scheduleSynopsis(id(), e.currentTarget.value)}
        onFocus={() => selectCard(id())}
        onBlur={() => void flushSynopsis()}
        onKeyDown={(e) => cardFieldKey(e, back)}
        onPointerDown={stop}
        onClick={stop}
        onDblClick={stop}
      />
      <div class="bcard-foot ui">
        <NodeIcon kind={props.node.kind} />
        <span>{cardKindLabel(props.node)}</span>
        <Show when={props.node.kind === "chapter"}>
          <StatusDot status={props.node.status ?? "rascunho"} />
          <span>{fmt(props.node.words ?? 0)} palavras</span>
        </Show>
        <Show when={inside(props.node)}>
          <span>{inside(props.node)}</span>
        </Show>
      </div>
    </div>
  );
}
