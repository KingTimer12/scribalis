import { UI_SCALES, UI_SCALE_LABEL } from "../../lib/constants";
import { setTheme, setUiScale, setWidth, textBigger, textReset, textSmaller } from "../../store/actions/prefs";
import { state } from "../../store/state";
import { IconMinus, IconPlus } from "../ui/icons";
import { Segmented, type SegmentedOption } from "../ui/Segmented";

const THEME_OPTIONS: SegmentedOption<"light" | "dark">[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];

const WIDTH_OPTIONS: SegmentedOption<0 | 1 | 2>[] = [
  { value: 0, label: "Estreita" },
  { value: 1, label: "Média" },
  { value: 2, label: "Larga" },
];

const UI_SCALE_OPTIONS: SegmentedOption<number>[] = UI_SCALES.map((_, i) => ({ value: i, label: UI_SCALE_LABEL[i] }));

/** Configurações › Aparência: theme, text size, interface size and text width, applied live. */
export function AppearanceSettings() {
  return (
    <section class="set-sec">
      <div class="set-group">
        <span class="set-label">Tema</span>
        <Segmented label="Tema" value={state.prefs.theme} onChange={setTheme} options={THEME_OPTIONS} />
      </div>

      <div class="set-group">
        <span class="set-label">Tamanho do texto</span>
        <div class="set-textctl">
          <button type="button" class="set-icon-btn" title="Diminuir texto (Ctrl −)" aria-label="Diminuir texto" onClick={textSmaller}>
            <IconMinus />
          </button>
          <span class="set-textval">{state.prefs.textPx} px</span>
          <button type="button" class="set-icon-btn" title="Aumentar texto (Ctrl +)" aria-label="Aumentar texto" onClick={textBigger}>
            <IconPlus />
          </button>
          <button type="button" class="set-link" title="Texto no tamanho padrão (Ctrl 0)" onClick={textReset}>
            Padrão
          </button>
        </div>
        <p class="set-preview">Era uma vez…</p>
      </div>

      <div class="set-group">
        <span class="set-label">Tamanho da interface</span>
        <Segmented label="Tamanho da interface" value={state.prefs.uiScale} onChange={setUiScale} options={UI_SCALE_OPTIONS} />
      </div>

      <div class="set-group">
        <span class="set-label">Largura do texto</span>
        <Segmented label="Largura do texto" value={state.prefs.width} onChange={setWidth} options={WIDTH_OPTIONS} />
      </div>
    </section>
  );
}
