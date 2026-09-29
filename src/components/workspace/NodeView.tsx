import { Match, Show, Switch } from "solid-js";
import type { AreaNode } from "../../api/types";
import { bookAsset } from "../../lib/assets";
import { isContainer } from "../../lib/tree";
import { openFile } from "../../store/actions/workspace";
import { focusTarget } from "../../store/focus";
import { openAreaNode } from "../../store/selectors/workspace";
import { state } from "../../store/state";
import { Corkboard } from "../corkboard/Corkboard";
import { FormatBar } from "../editor/FormatBar";
import { RichEditor } from "../editor/RichEditor";
import { EmptyArea } from "./EmptyArea";

/** Lower-case extension of the node's file, without the dot ("" when none). */
const extOf = (node: AreaNode) => {
  const name = node.file ?? "";
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
};

/** A free text: read-only title and the shared editor (its notes live in the drawer, Ctrl ;). */
function TextView(props: { node: AreaNode }) {
  return (
    <div class="col ws-doc flex h-full flex-col gap-3.5 pt-16">
      <h2 class="ed-title ws-title">{props.node.title}</h2>
      <FormatBar />
      <div class="ed-scroll" onClick={(e) => e.target === e.currentTarget && focusTarget("body", "end")}>
        <RichEditor scope="area" />
      </div>
    </div>
  );
}

function ImageView(props: { node: AreaNode }) {
  const src = () => (state.book && props.node.file ? bookAsset(state.book.dir, "area/" + props.node.file, 0) : null);
  return (
    <div class="ws-media">
      <h2 class="ws-media-title">{props.node.title}</h2>
      <Show when={src()} fallback={<p class="ui">A imagem só aparece no app desktop.</p>}>
        {(url) => <img class="ws-img" src={url()} alt={props.node.title} />}
      </Show>
    </div>
  );
}

function FileView(props: { node: AreaNode }) {
  return (
    <div class="ws-media">
      <h2 class="ws-media-title">{props.node.title}</h2>
      <p class="ui">{extOf(props.node) ? "Arquivo ." + extOf(props.node) : "Arquivo"}</p>
      <div>
        <button type="button" class="sp-btn" onClick={() => void openFile(props.node.id)}>
          Abrir no app padrão
        </button>
      </div>
    </div>
  );
}

/** Right pane of the workspace: the open node (a folder shows its board), or the empty state. */
export function NodeView() {
  const of = (kind: AreaNode["kind"]) => () => {
    const n = openAreaNode();
    return n?.kind === kind ? n : null;
  };
  const board = () => {
    const n = openAreaNode();
    return n && isContainer(n.kind) ? n : null;
  };
  const text = of("text");
  const image = of("image");
  const file = of("file");
  // Non-keyed matches: moving between two texts keeps the same editor mounted.
  return (
    <Switch fallback={<EmptyArea />}>
      <Match when={board()}>{(n) => <Corkboard folder={n()} />}</Match>
      <Match when={text()}>{(n) => <TextView node={n()} />}</Match>
      <Match when={image()}>{(n) => <ImageView node={n()} />}</Match>
      <Match when={file()}>{(n) => <FileView node={n()} />}</Match>
    </Switch>
  );
}
