import { createSignal, For, onCleanup, onMount } from "solid-js";

export interface MenuItem {
  label: string;
  act: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface ContextMenuProps {
  /** Viewport point where the menu opens (it is nudged to stay on screen). */
  x: number;
  y: number;
  items: MenuItem[];
  /** Called before an item runs, and on Esc / click outside. */
  onClose: () => void;
}

const MARGIN = 8;

/** Generic floating menu: arrows + Enter, Esc or a click outside closes it. */
export function ContextMenu(props: ContextMenuProps) {
  let el!: HTMLDivElement;
  const firstEnabled = () => Math.max(0, props.items.findIndex((it) => !it.disabled));
  const [idx, setIdx] = createSignal(firstEnabled());
  const [pos, setPos] = createSignal({ x: props.x, y: props.y });

  const run = (it: MenuItem) => {
    if (it.disabled) return;
    props.onClose();
    it.act();
  };

  const step = (dir: 1 | -1) => {
    const n = props.items.length;
    let i = idx();
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!props.items[i].disabled) return setIdx(i);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") step(1);
    else if (e.key === "ArrowUp") step(-1);
    else if (e.key === "Enter" || e.key === " ") {
      const it = props.items[idx()];
      if (it) run(it);
    } else if (e.key === "Escape" || e.key === "Tab") props.onClose();
    else return;
    e.preventDefault();
  };

  const outside = (e: PointerEvent) => {
    if (!el.contains(e.target as Node)) props.onClose();
  };

  onMount(() => {
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(MARGIN, Math.min(props.x, window.innerWidth - r.width - MARGIN)),
      y: Math.max(MARGIN, Math.min(props.y, window.innerHeight - r.height - MARGIN)),
    });
    el.focus({ preventScroll: true });
    window.addEventListener("pointerdown", outside, true);
  });
  onCleanup(() => window.removeEventListener("pointerdown", outside, true));

  return (
    <div
      ref={el}
      class="ctx"
      role="menu"
      tabIndex={-1}
      aria-activedescendant={"ctx-" + idx()}
      style={{ left: pos().x + "px", top: pos().y + "px" }}
      onKeyDown={onKey}
      onContextMenu={(e) => e.preventDefault()}
    >
      <For each={props.items}>
        {(it, i) => (
          <div
            id={"ctx-" + i()}
            role="menuitem"
            class="ctx-item"
            classList={{ act: i() === idx(), danger: !!it.danger }}
            aria-disabled={it.disabled || undefined}
            onPointerEnter={() => !it.disabled && setIdx(i())}
            onClick={() => run(it)}
          >
            {it.label}
          </div>
        )}
      </For>
    </div>
  );
}
