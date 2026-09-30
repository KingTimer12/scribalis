import { onMount } from "solid-js";
import type { BoardCard as Card } from "../../api/types";
import { loadCardText, selectCard } from "../../store/actions/board";
import { flushCard, scheduleCardText, scheduleCardTitle } from "../../store/actions/boardText";
import { focusTarget } from "../../store/focus";
import { cardFieldKey } from "../../store/keys/cardField";
import { state } from "../../store/state";
import { cardDrag, consumeCardClick, pointerDownOnCard } from "./cardDrag";

export const cardDomId = (id: string) => "bcard-" + id;
export const cardTitleId = (id: string) => "bcard-title-" + id;
export const cardTextId = (id: string) => "bcard-text-" + id;

const stop = (e: Event) => e.stopPropagation();

/** One index card: a ruled card with its title over a red line and its text on the rules. */
export function BoardCard(props: { card: Card; onMenu: (x: number, y: number) => void; onEditText: (id: string) => void }) {
  const id = () => props.card.id;
  onMount(() => void loadCardText(id()));
  const dropHere = () => {
    const d = cardDrag();
    return d && d.targetId === id() ? d.pos : null;
  };
  const leave = () => {
    void flushCard();
  };
  const back = () => focusTarget("board");
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
      onPointerDown={(e) => pointerDownOnCard(e, id())}
      onClick={() => {
        if (consumeCardClick()) return;
        selectCard(id());
        focusTarget("board");
      }}
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
        aria-label="Título do cartão"
        placeholder="Título do cartão"
        value={props.card.title}
        onInput={(e) => scheduleCardTitle(id(), e.currentTarget.value)}
        onFocus={() => selectCard(id())}
        onBlur={leave}
        onKeyDown={(e) => cardFieldKey(e, back, () => props.onEditText(id()))}
        onPointerDown={stop}
        onClick={stop}
        autocomplete="off"
      />
      <textarea
        id={cardTextId(id())}
        class="bcard-text"
        aria-label="Texto do cartão"
        placeholder="Anote aqui…"
        value={state.boardText[id()] ?? ""}
        onInput={(e) => scheduleCardText(id(), e.currentTarget.value)}
        onFocus={() => selectCard(id())}
        onBlur={leave}
        onKeyDown={(e) => cardFieldKey(e, back)}
        onPointerDown={stop}
        onClick={stop}
      />
    </div>
  );
}
