import { createEffect, createSignal, For, Show } from "solid-js";
import { GOALS } from "../../lib/constants";
import { fmt } from "../../lib/format";
import { GOAL_MAX, GOAL_MIN, parseGoal } from "../../lib/goal";
import { setGoal } from "../../store/actions/prefs";
import { state } from "../../store/state";

/** Configurações › Escrita: the daily goal, typed freely ("1.5k", "1600") or picked from the usual values. */
export function WritingSettings() {
  const [text, setText] = createSignal(fmt(state.prefs.goal));
  const [bad, setBad] = createSignal(false);
  // Follows changes made elsewhere (the palette cycles the goal too).
  createEffect(() => setText(fmt(state.prefs.goal)));

  function commit() {
    const goal = parseGoal(text());
    if (goal === null) {
      setBad(text().trim() !== "");
      if (!text().trim()) setText(fmt(state.prefs.goal));
      return;
    }
    setBad(false);
    if (goal !== state.prefs.goal) setGoal(goal);
    else setText(fmt(goal));
  }

  return (
    <section class="set-sec">
      <div class="set-group">
        <label class="set-label" for="set-goal">Meta diária</label>
        <div class="set-goal">
          <input
            id="set-goal"
            class="set-input set-goal-input"
            classList={{ bad: bad() }}
            value={text()}
            inputmode="decimal"
            autocomplete="off"
            aria-invalid={bad()}
            aria-describedby="set-goal-help"
            onInput={(e) => (setText(e.currentTarget.value), setBad(false))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              // Esc closes the modal; other keys belong to the field.
              if (e.key !== "Escape") e.stopPropagation();
            }}
          />
          <span class="set-goal-unit">palavras por dia</span>
        </div>
        <div class="set-chips" role="group" aria-label="Metas comuns">
          <For each={GOALS}>
            {(g) => (
              <button type="button" class="set-chip" classList={{ on: state.prefs.goal === g }} onClick={() => (setBad(false), setGoal(g))}>
                {fmt(g)}
              </button>
            )}
          </For>
        </div>
        <p id="set-goal-help" class="set-help" classList={{ bad: bad() }}>
          <Show when={bad()} fallback={<>Escreva do jeito que preferir: 1600, 1.600, 1.5k ou 2 mil.</>}>
            Use um número entre {fmt(GOAL_MIN)} e {fmt(GOAL_MAX)}, por exemplo 1.5k.
          </Show>
        </p>
      </div>
    </section>
  );
}
