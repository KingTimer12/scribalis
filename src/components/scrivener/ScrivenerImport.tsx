import { For, onMount, Show } from "solid-js";
import type { NodeKind, ScanItem, ScanKind } from "../../api/types";
import { canBeChapters, countChapters, coveredBy } from "../../lib/scrivenerChoice";
import { cancelScrivenerImport, confirmScrivenerImport, toggleScrivenerFolder } from "../../store/actions/scrivener";
import { state } from "../../store/state";
import { NodeIcon } from "../workspace/NodeIcon";

/** Binder kinds drawn with the workspace icons: the top-level folders look like any folder. */
const ICON: Record<ScanKind, NodeKind> = { draft: "folder", research: "folder", folder: "folder", text: "text", image: "image", file: "file" };

function BinderRow(props: { item: ScanItem; depth: number }) {
  const s = () => state.scrivener!;
  const covered = () => coveredBy(s().view, s().chosen, props.item.key);
  const checked = () => covered() || s().chosen.includes(props.item.key);
  const boxId = () => "scriv-" + props.item.key;
  return (
    <>
      <div class="scriv-row" style={{ "padding-left": 8 + props.depth * 18 + "px" }}>
        <NodeIcon kind={ICON[props.item.kind]} />
        <span class="ws-t">{props.item.title || "Sem título"}</span>
        <Show when={canBeChapters(props.item)}>
          <label class="scriv-check ui" for={boxId()}>
            <input
              id={boxId()}
              type="checkbox"
              checked={checked()}
              disabled={covered() || s().busy}
              onChange={() => toggleScrivenerFolder(props.item.key)}
            />
            virar capítulos
          </label>
        </Show>
      </div>
      <For each={props.item.children}>{(c) => <BinderRow item={c} depth={props.depth + 1} />}</For>
    </>
  );
}

/** Modal to choose which Scrivener folders become chapters before importing. */
export function ScrivenerImport() {
  let importBtn!: HTMLButtonElement;
  const s = () => state.scrivener!;
  const count = () => countChapters(s().view, s().chosen);

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
        <p class="scriv-text">Marque as pastas cujos itens viram capítulos. O resto vai para a área de trabalho.</p>
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
