import { createSignal, Show } from "solid-js";
import type { Status } from "../../api/types";
import { STATUS, STATUS_LABEL } from "../../lib/constants";
import { moveChapterStep, setStatus } from "../../store/actions/chapters";
import { goChapterStep } from "../../store/actions/open";
import { currentChapter, hasNextChapter, hasPrevChapter } from "../../store/selectors/book";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { IconChevronLeft, IconChevronRight } from "../ui/icons";
import { StatusDot } from "../ui/StatusDot";
import { ChapterLabel } from "./ChapterLabel";
import { FocusButton, NotesButton } from "./NotesFocusButtons";

/** Alt ↑ / Alt ↓: previous or next chapter, disabled at either end of the reading order. */
function NavButton(props: { dir: -1 | 1 }) {
  const isPrev = () => props.dir === -1;
  const enabled = () => (isPrev() ? hasPrevChapter() : hasNextChapter());
  const label = () => (isPrev() ? "Capítulo anterior" : "Próximo capítulo");
  return (
    <button
      type="button"
      class="bar-btn"
      title={label() + (isPrev() ? " (Alt ↑)" : " (Alt ↓)")}
      aria-label={label()}
      disabled={!enabled()}
      onClick={() => void goChapterStep(props.dir)}
    >
      <Show when={isPrev()}>
        <IconChevronLeft size={14} />
      </Show>
      <span class="bar-btn-label">{isPrev() ? "Anterior" : "Próximo"}</span>
      <Show when={!isPrev()}>
        <IconChevronRight size={14} />
      </Show>
    </button>
  );
}

/** Status menu: the three statuses (current one disabled, like the tree's) plus moving the chapter. */
function statusMenuItems(id: string, current: Status): MenuItem[] {
  return [
    ...STATUS.map((s): MenuItem => ({ label: STATUS_LABEL[s], disabled: s === current, act: () => setStatus(id, s) })),
    { label: "Mover para cima", hint: "Alt Shift ↑", act: () => void moveChapterStep(-1) },
    { label: "Mover para baixo", hint: "Alt Shift ↓", act: () => void moveChapterStep(1) },
  ];
}

/** "● Rascunho": opens a menu to pick the status directly, or move the chapter among its siblings. */
function StatusButton() {
  const [menu, setMenu] = createSignal<{ x: number; y: number } | null>(null);
  const status = () => currentChapter()?.status ?? "rascunho";
  const open = (e: MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ x: r.left, y: r.bottom + 4 });
  };
  return (
    <>
      <button
        type="button"
        class="bar-btn"
        aria-haspopup="menu"
        aria-label={"Status: " + STATUS_LABEL[status()]}
        title="Status do capítulo (Alt S passa para o próximo)"
        onClick={open}
      >
        <StatusDot status={status()} />
        <span class="bar-btn-label">{STATUS_LABEL[status()]}</span>
      </button>
      <Show when={menu()}>
        {(m) => {
          const id = currentChapter()?.id;
          return (
            <ContextMenu
              x={m().x}
              y={m().y}
              items={id ? statusMenuItems(id, status()) : []}
              onClose={() => setMenu(null)}
            />
          );
        }}
      </Show>
    </>
  );
}

/** The row above the format bar: chapter navigation, status, and the Notas/Foco toggles. */
export function ChapterBar() {
  return (
    <div class="chapter-bar chrome flex items-center gap-2">
      <NavButton dir={-1} />
      <NavButton dir={1} />
      <ChapterLabel />
      <StatusButton />
      <div class="flex-1" />
      <NotesButton />
      <FocusButton />
    </div>
  );
}
