import { For } from "solid-js";

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

/**
 * A row of mutually exclusive choices (`role="radiogroup"` of `role="radio"` buttons).
 * Arrow keys move the selection and focus to the next/previous option, as in a native radio group.
 */
export function Segmented<T extends string | number>(props: {
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  let ref: HTMLDivElement | undefined;
  const idx = () => props.options.findIndex((o) => o.value === props.value);

  function select(i: number) {
    const n = props.options.length;
    const opt = props.options[((i % n) + n) % n];
    props.onChange(opt.value);
    // Move DOM focus with the selection, like a native radiogroup.
    queueMicrotask(() => ref?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      select(idx() + 1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      select(idx() - 1);
    }
  }

  return (
    <div class="seg" role="radiogroup" aria-label={props.label} onKeyDown={onKeyDown} ref={ref}>
      <For each={props.options}>
        {(o, i) => (
          <button
            type="button"
            class="seg-btn"
            role="radio"
            aria-checked={o.value === props.value}
            tabIndex={o.value === props.value ? 0 : -1}
            onClick={() => select(i())}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}
