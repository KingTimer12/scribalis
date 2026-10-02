import { createSignal, For, Show } from "solid-js";
import { norm } from "../../lib/format";

export interface Chip {
  value: string;
  label: string;
}

/**
 * Chips with a text box that offers suggestions: tags (typing a new one creates it) or the sheets
 * of a multiple reference (only existing ones). A chip is never added twice.
 */
export function ChipField(props: {
  id: string;
  chips: Chip[];
  /** Everything that may be added; chosen ones are left out of the menu. */
  options: Chip[];
  /** Typing a value that is not among the options adds it as is (tags). */
  create?: boolean;
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  /** Click on a chip's label (a reference opens its sheet). */
  onOpen?: (value: string) => void;
}) {
  const [text, setText] = createSignal("");
  const [open, setOpen] = createSignal(false);
  const [idx, setIdx] = createSignal(-1);
  let input!: HTMLInputElement;

  const chosen = () => new Set(props.chips.map((c) => norm(c.value)));
  const matches = () => {
    const q = norm(text().trim());
    return props.options
      .filter((o) => !chosen().has(norm(o.value)) && (!q || norm(o.label).includes(q)))
      .slice(0, 8);
  };

  function add(value: string) {
    setText("");
    setIdx(-1);
    if (!chosen().has(norm(value))) props.onAdd(value);
    input.focus();
  }

  /** Enter (or a comma, for tags): the highlighted option, an option with the typed name, or a new tag. */
  function commit() {
    const pick = matches()[idx()];
    if (pick) return add(pick.value);
    const typed = text().trim();
    if (!typed) return;
    const same = props.options.find((o) => norm(o.label) === norm(typed));
    if (same) return add(same.value);
    if (props.create) return add(typed);
  }

  const onKey = (e: KeyboardEvent) => {
    const list = matches();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      const step = e.key === "ArrowDown" ? 1 : -1;
      setIdx((i) => (list.length ? (i + step + list.length) % list.length : -1));
    } else if (e.key === "Enter" || (e.key === "," && props.create)) {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !text() && props.chips.length) {
      props.onRemove(props.chips[props.chips.length - 1].value);
    } else if (e.key === "Escape" && open()) {
      // Only the menu closes; the sheet stays open.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div class="chips" onClick={() => input.focus()}>
      <For each={props.chips}>
        {(c) => (
          <span class="chip">
            <Show when={props.onOpen} fallback={<span>{c.label}</span>}>
              <button type="button" class="chip-open" title="Abrir ficha" onClick={() => props.onOpen?.(c.value)}>
                {c.label}
              </button>
            </Show>
            <button type="button" class="chip-x" aria-label={"Tirar " + c.label} onClick={() => props.onRemove(c.value)}>
              ×
            </button>
          </span>
        )}
      </For>
      <div class="chips-box">
        <input
          id={props.id}
          ref={input}
          class="chips-input"
          value={text()}
          placeholder={props.placeholder}
          autocomplete="off"
          role="combobox"
          aria-expanded={open() && matches().length > 0}
          aria-controls={props.id + "-menu"}
          onInput={(e) => {
            setText(e.currentTarget.value);
            setOpen(true);
            setIdx(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKey}
        />
        <Show when={open() && matches().length}>
          <ul class="chips-menu" id={props.id + "-menu"} role="listbox">
            <For each={matches()}>
              {(o, i) => (
                <li
                  role="option"
                  class="chips-opt"
                  classList={{ on: i() === idx() }}
                  aria-selected={i() === idx()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add(o.value);
                  }}
                >
                  {o.label}
                </li>
              )}
            </For>
          </ul>
        </Show>
      </div>
    </div>
  );
}
