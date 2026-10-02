import { For, onMount, Show } from "solid-js";
import type { NodeKind, ScanItem, ScanKind } from "../../api/types";
import { allChildrenChosen, canBeChapter, chapterFolder, countChapters, coveredBy, eligibleChildren } from "../../lib/scrivenerChoice";
import {
  cancelScrivenerImport, confirmScrivenerImport, toggleScrivenerChildren, toggleScrivenerItem,
} from "../../store/actions/scrivener";
import { state } from "../../store/state";
import { NodeIcon } from "../workspace/NodeIcon";

/** Binder kinds drawn with the workspace icons: the top-level folders look like any folder. */
const ICON: Record<ScanKind, NodeKind> = { draft: "folder", research: "folder", folder: "folder", text: "text", image: "image", file: "file" };

function BinderRow(props: { item: ScanItem; depth: number }) {
  const s = () => state.scrivener!;
  const key = () => props.item.key;
  const covered = () => coveredBy(s().view, s().chosen, key());
  const chosen = () => s().chosen.includes(key());
  const checked = () => covered() || chosen();
  /** Shortcut on folders: every direct child as its own chapter. */
  const showChildren = () => !covered() && !chosen() && eligibleChildren(s().view, key()).length > 1;
  const boxId = () => "scriv-" + key();
  return (
    <>
      <div class="scriv-row" classList={{ on: checked() }} style={{ "padding-left": 8 + props.depth * 18 + "px" }}>
        <NodeIcon kind={ICON[props.item.kind]} />
        <span class="ws-t">{props.item.title || "Sem título"}</span>
        <Show when={showChildren()}>
          <button type="button" class="scriv-kids ui" disabled={s().busy} onClick={() => toggleScrivenerChildren(key())}>
            {allChildrenChosen(s().view, s().chosen, key()) ? "desmarcar itens" : "marcar itens"}
          </button>
        </Show>
        <Show when={canBeChapter(props.item)}>
          <label class="scriv-check ui" for={boxId()}>
            <input
              id={boxId()}
              type="checkbox"
              checked={checked()}
              disabled={covered() || s().busy}
              onChange={() => toggleScrivenerItem(key())}
            />
            capítulo
          </label>
        </Show>
      </div>
      <For each={props.item.children}>{(c) => <BinderRow item={c} depth={props.depth + 1} />}</For>
    </>
  );
}

/** Modal to choose which Scrivener items become chapters before importing. */
export function ScrivenerImport() {
  let importBtn!: HTMLButtonElement;
  const s = () => state.scrivener!;
  const count = () => countChapters(s().view, s().chosen);
  /** In a new book, the folder whose items are all marked stays where it is, as the Manuscrito. */
  const keeps = () => (s().target.type === "new" ? chapterFolder(s().view, s().chosen) : null);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    // The dialog owns Esc: the global handler would only close panels behind it.
    e.preventDefault();
    e.stopPropagation();
    cancelScrivenerImport();
  };

  onMount(() => importBtn.focus());

  return (
    <>
      <div class="scrim" onClick={cancelScrivenerImport} />
      <div class="scriv" role="dialog" aria-modal="true" aria-labelledby="scriv-title" onKeyDown={onKey}>
        <h2 id="scriv-title" class="scriv-title">
          Importar «{s().view.title}»
        </h2>
        <p class="scriv-text">
          Marque os itens que viram capítulos; o que estiver dentro de cada um vira subcapítulo. O resto vai para a
          área de trabalho.
        </p>
        <Show when={keeps()}>
          {(f) => (
            <p class="scriv-text scriv-keep">
              «{f().title || "Sem título"}» fica onde está e com o mesmo nome, como a pasta de capítulos (o Manuscrito).
            </p>
          )}
        </Show>
        <div class="scriv-tree">
          <For each={s().view.items}>{(item) => <BinderRow item={item} depth={0} />}</For>
        </div>
        <div class="scriv-foot">
          <span class="ui">{(count() === 1 ? "1 capítulo" : count() + " capítulos") + " · o resto vai para a área de trabalho"}</span>
          <div class="flex gap-2">
            <button type="button" class="sp-btn" disabled={s().busy} onClick={cancelScrivenerImport}>
              Cancelar
            </button>
            <button
              type="button"
              class="sp-btn primary"
              ref={importBtn}
              disabled={s().busy}
              onClick={() => void confirmScrivenerImport()}
            >
              {s().busy ? "Importando…" : "Importar"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
