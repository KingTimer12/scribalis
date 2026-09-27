import { emptyChap } from "../data/samples";
import { STATUS, STATUS_LABEL } from "../lib/constants";
import { pad } from "../lib/format";
import { focusTarget } from "./focus";
import { currentBook, currentChapter, editBook, session, setState, state, updCur } from "./state";
import { flash } from "./ui";

/* ---------- actions ---------- */

export function insertChapter(at: number) {
  session.enterStreak = 0;
  editBook((b) => {
    b.chapters.splice(at, 0, emptyChap());
    b.cur = at;
  });
  setState("tripleHint", false);
  focusTarget("title", 0);
  flash("Capítulo " + pad(at + 1) + " criado");
}

/** Splits the current chapter: `after` becomes the body of a new chapter right below. */
export function splitHere(before: string, after: string) {
  const at = (currentBook()?.cur ?? 0) + 1;
  session.enterStreak = 0;
  editBook((b) => {
    b.chapters[b.cur].body = before;
    const fresh = emptyChap();
    fresh.body = after;
    b.chapters.splice(at, 0, fresh);
    b.cur = at;
  });
  setState("tripleHint", false);
  focusTarget("title", 0);
  flash("Capítulo " + pad(at + 1) + " criado" + (after ? " — o texto seguinte foi junto" : ""));
}

export function goChapter(i: number, caret: number | "end" = "end") {
  const n = currentBook()?.chapters.length ?? 0;
  if (i < 0 || i >= n) {
    flash(i < 0 ? "Este é o primeiro capítulo" : "Este é o último capítulo");
    return;
  }
  session.enterStreak = 0;
  editBook((b) => {
    b.cur = i;
  }, false);
  setState("tripleHint", false);
  focusTarget("body", caret);
}

/** Swaps chapter `from` with its neighbor. Returns the new position, or null. */
export function moveChapter(from: number, dir: -1 | 1): number | null {
  const n = currentBook()?.chapters.length ?? 0;
  const to = from + dir;
  if (to < 0 || to >= n) return null;
  editBook((b) => {
    const tmp = b.chapters[from];
    b.chapters[from] = b.chapters[to];
    b.chapters[to] = tmp;
    if (b.cur === from) b.cur = to;
    else if (b.cur === to) b.cur = from;
  });
  flash("Movido para a posição " + pad(to + 1));
  return to;
}

export function cycleStatus() {
  const c = currentChapter();
  if (!c) return;
  const next = STATUS[(STATUS.indexOf(c.status) + 1) % STATUS.length];
  updCur({ status: next });
  flash("Status: " + STATUS_LABEL[next]);
}

export function deleteCurrentChapter() {
  const b = currentBook();
  if (!b) return;
  if (b.chapters.length === 1) return flash("A obra precisa de pelo menos um capítulo");
  const gone = b.cur;
  editBook((bk) => {
    bk.chapters.splice(gone, 1);
    bk.cur = Math.min(gone, bk.chapters.length - 1);
  });
  focusTarget("body", "end");
  flash("Capítulo " + pad(gone + 1) + " excluído");
}

export async function copyCurrentChapter() {
  const b = currentBook();
  const c = currentChapter();
  if (!b || !c) return;
  const text = "Capítulo " + (b.cur + 1) + (c.title ? " — " + c.title : "") + "\n\n" + c.body;
  try {
    await navigator.clipboard.writeText(text);
    flash("Capítulo copiado");
  } catch {
    flash("Não foi possível copiar aqui");
  }
}

export function setBookTitle(title: string) {
  editBook((b) => {
    b.title = title;
  });
}

/* ---------- editor fields ---------- */

export function bookTitleKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === "ArrowDown") {
    e.preventDefault();
    focusTarget("title", "end");
  }
}

export function titleKey(e: KeyboardEvent) {
  if (e.key === "Enter" || (e.key === "ArrowDown" && !e.altKey)) {
    e.preventDefault();
    focusTarget("body", 0);
  }
}

export function onBodyInput(el: HTMLTextAreaElement) {
  const v = el.value;
  const hint = session.enterStreak >= 2 && v.slice(0, el.selectionStart).endsWith("\n\n");
  updCur({ body: v });
  setState("tripleHint", hint);
}

export function resetEnterStreak() {
  session.enterStreak = 0;
  if (state.tripleHint) setState("tripleHint", false);
}

const MODIFIER_KEYS = ["Shift", "Control", "Alt", "Meta", "CapsLock"];

/** Enter ×3 creates a chapter; ↑ at the start goes back to the title. */
export function bodyKey(e: KeyboardEvent & { currentTarget: HTMLTextAreaElement }) {
  const el = e.currentTarget;
  const mods = e.ctrlKey || e.metaKey || e.altKey;
  if (e.key === "Enter" && !mods && !e.shiftKey) {
    const s = el.selectionStart;
    const end = el.selectionEnd;
    const v = el.value;
    const before = v.slice(0, s);
    if (session.enterStreak >= 2 && s === end && before.endsWith("\n\n")) {
      e.preventDefault();
      splitHere(before.slice(0, -2).replace(/\s+$/, ""), v.slice(end).replace(/^\s+/, ""));
      return;
    }
    session.enterStreak += 1;
    return;
  }
  if (!MODIFIER_KEYS.includes(e.key)) resetEnterStreak();
  if (e.key === "ArrowUp" && !mods && el.selectionStart === 0 && el.selectionEnd === 0) {
    e.preventDefault();
    focusTarget("title", "end");
  }
}

/** Arrows navigate, Alt+arrows reorder, Enter opens. */
export function indexKey(e: KeyboardEvent) {
  const n = currentBook()?.chapters.length ?? 0;
  const sel = state.indexSel;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.key === "ArrowUp" ? -1 : 1;
    if (e.altKey) {
      const to = moveChapter(sel, dir);
      if (to != null) setState("indexSel", to);
    } else setState("indexSel", Math.max(0, Math.min(n - 1, sel + dir)));
  } else if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    openFromIndex(sel);
  }
}

export function openFromIndex(i: number) {
  setState("panel", null);
  goChapter(i);
}
