import type { AreaNode } from "../../api/types";
import { inManuscript } from "../../lib/manuscript";
import { createCard } from "../../store/actions/board";
import { openNode } from "../../store/actions/open";
import { flash } from "../../store/actions/ui";
import { createQuietly, docKindUnder, requestDelete } from "../../store/actions/workspace";
import { state } from "../../store/state";
import type { MenuItem } from "../ui/ContextMenu";

/** "Novo capítulo" inside the Manuscrito, "Novo documento" outside it. */
export const newCardLabel = (parent: string) => (inManuscript(state.area, parent) ? "Novo capítulo" : "Novo documento");

/** Right click on a card of `parent`'s board. */
export function cardMenu(parent: AreaNode, node: AreaNode): MenuItem[] {
  const id = node.id;
  const index = (parent.children ?? []).findIndex((c) => c.id === id);
  const items: MenuItem[] = [
    { label: "Abrir", act: () => void openNode(id) },
    { label: newCardLabel(parent.id) + " depois", act: () => void createCard(parent.id, index + 1) },
  ];
  if (node.kind === "chapter" || node.kind === "text") {
    items.push({
      label: "Novo subdocumento",
      act: () =>
        void createQuietly(docKindUnder(id), id, node.children?.length ?? 0).then((made) => made && flash("Subdocumento criado")),
    });
  }
  items.push({ label: "Excluir", hint: "Del", danger: true, act: () => void requestDelete(id) });
  return items;
}

/** Right click on the board's background: a document at the end. */
export function backgroundMenu(parent: AreaNode): MenuItem[] {
  return [{ label: newCardLabel(parent.id), act: () => void createCard(parent.id) }];
}

const KIND_LABEL: Record<AreaNode["kind"], string> = {
  manuscript: "Manuscrito", folder: "Pasta", chapter: "Capítulo", text: "Documento", image: "Imagem", file: "Arquivo",
};

/** Kind named at the foot of a card. */
export const cardKindLabel = (node: AreaNode) => KIND_LABEL[node.kind];
