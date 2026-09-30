import { createCard, duplicateCard, requestCardDelete } from "../../store/actions/board";
import { state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

/** Right click on a card. */
export function cardMenu(id: string): MenuItem[] {
  return [
    {
      label: "Novo cartão depois",
      act: () => void createCard(state.board.findIndex((c) => c.id === id) + 1),
    },
    { label: "Duplicar", act: () => void duplicateCard(id) },
    { label: "Excluir", hint: "Del", danger: true, act: () => void requestCardDelete(id) },
  ];
}

/** Right click on the board's background: a card at the end. */
export function backgroundMenu(): MenuItem[] {
  return [{ label: "Novo cartão", act: () => void createCard() }];
}
