import { For, Show, type JSX } from "solid-js";
import type { Align } from "../../api/types";
import { insertSeparator } from "../../editor/bridge";
import { clearParagraphFormat, formatState, setAlign, toggleBold, toggleItalic } from "../../editor/format";
import { insertChapterImage } from "../../store/actions/images";
import { openPanel } from "../../store/actions/ui";
import { currentChapter } from "../../store/selectors/book";
import { state } from "../../store/state";
import { IconEraser, IconImage, IconSeparator } from "../ui/icons";

/** Line offsets (x1, x2) per row: four strokes drawn like the window buttons. */
const ALIGN_ROWS: Record<Align, [number, number][]> = {
  left: [[1, 13], [1, 9], [1, 13], [1, 8]],
  center: [[1, 13], [3, 11], [1, 13], [4, 10]],
  right: [[1, 13], [5, 13], [1, 13], [6, 13]],
  justify: [[1, 13], [1, 13], [1, 13], [1, 13]],
};

const ALIGNS: { a: Align; label: string; key: string }[] = [
  { a: "left", label: "Alinhar à esquerda", key: "Ctrl Shift L" },
  { a: "center", label: "Centralizar", key: "Ctrl Shift E" },
  { a: "right", label: "Alinhar à direita", key: "Ctrl Shift R" },
  { a: "justify", label: "Justificar", key: "Ctrl Shift J" },
];

function AlignIcon(props: { a: Align }) {
  return (
    <svg viewBox="0 0 14 14" aria-hidden="true">
      <For each={ALIGN_ROWS[props.a]}>{([x1, x2], i) => <line x1={x1} x2={x2} y1={2.5 + i() * 3} y2={2.5 + i() * 3} />}</For>
    </svg>
  );
}

/** Keeps the editor selection: toolbar clicks must not steal focus. */
const keepSelection = (e: MouseEvent) => e.preventDefault();

function FmtButton(props: { label: string; title: string; pressed: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <button
      type="button"
      class="fmt-btn"
      aria-label={props.label}
      aria-pressed={props.pressed}
      title={props.title}
      onMouseDown={keepSelection}
      onClick={() => props.onClick()}
    >
      {props.children}
    </button>
  );
}

/** Thin formatting toolbar above the text; fades out in focus mode. */
export function FormatBar() {
  return (
    <div class="fmt-bar chrome" role="toolbar" aria-label="Formatação">
      <FmtButton label="Negrito" title="Negrito (Ctrl B)" pressed={formatState().bold} onClick={toggleBold}>
        <b>B</b>
      </FmtButton>
      <FmtButton label="Itálico" title="Itálico (Ctrl I)" pressed={formatState().italic} onClick={toggleItalic}>
        <i>I</i>
      </FmtButton>
      <span class="fmt-sep" aria-hidden="true" />
      <For each={ALIGNS}>
        {(o) => (
          <FmtButton
            label={o.label}
            title={`${o.label} (${o.key})`}
            pressed={formatState().align === o.a}
            onClick={() => setAlign(o.a)}
          >
            <AlignIcon a={o.a} />
          </FmtButton>
        )}
      </For>
      {/* Scene separator and image insertion only make sense inside a chapter (see WriterKeys' separatorKey). */}
      <Show when={currentChapter()}>
        <span class="fmt-sep" aria-hidden="true" />
        <FmtButton label="Inserir imagem" title="Inserir imagem (Ctrl Shift I)" pressed={false} onClick={() => void insertChapterImage()}>
          <IconImage />
        </FmtButton>
        <FmtButton label="Inserir separador" title="Inserir separador (Ctrl Enter)" pressed={false} onClick={insertSeparator}>
          <IconSeparator />
        </FmtButton>
      </Show>
      <FmtButton label="Limpar formatação do parágrafo" title="Limpar formatação do parágrafo" pressed={false} onClick={clearParagraphFormat}>
        <IconEraser />
      </FmtButton>
      <span class="fmt-sep" aria-hidden="true" />
      <FmtButton
        label="Espaçamento do parágrafo"
        title="Espaçamento do parágrafo"
        pressed={state.panel === "spacing"}
        onClick={() => openPanel("spacing")}
      >
        <span class="fmt-text">Espaçamento</span>
      </FmtButton>
    </div>
  );
}
