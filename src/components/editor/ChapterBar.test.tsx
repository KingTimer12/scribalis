import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { mockInvoke } from "../../api/mock";
import type { BookSummary } from "../../api/types";
import { findNode } from "../../lib/tree";
import { newChapterAfterCurrent } from "../../store/actions/chapters";
import { openBook } from "../../store/actions/library";
import { goChapterStep } from "../../store/actions/open";
import { state } from "../../store/state";
import { ChapterBar } from "./ChapterBar";
import { FocusExitButton } from "./FocusExitButton";

/** Opens a fresh book (one chapter), isolated from the samples and the other tests. */
async function openNew() {
  const created = await mockInvoke<BookSummary>("library_create", { title: "Obra de teste" });
  await openBook(created.id);
}

function mounted() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(
    () => (
      <>
        <ChapterBar />
        <FocusExitButton />
      </>
    ),
    host,
  );
  return { host, done: () => (dispose(), host.remove()) };
}

describe("ChapterBar", () => {
  it("disables Anterior and Próximo when there is no neighbor to go to", async () => {
    await openNew();
    const { host, done } = mounted();
    const prev = host.querySelector<HTMLButtonElement>('[aria-label="Capítulo anterior"]')!;
    const next = host.querySelector<HTMLButtonElement>('[aria-label="Próximo capítulo"]')!;
    // A lone chapter has no neighbor either way.
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(true);

    await newChapterAfterCurrent();
    // A new chapter after the current one opens on it: now second of two, Próximo is disabled.
    expect(prev.disabled).toBe(false);
    expect(next.disabled).toBe(true);

    await goChapterStep(-1);
    // Back on the first of two: Anterior is disabled, Próximo is not.
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    done();
  });

  it("the status button opens a menu that sets the chapter's status", async () => {
    await openNew();
    const { host, done } = mounted();
    const id = state.areaOpen!;
    host.querySelector<HTMLButtonElement>('[aria-label="Status: Rascunho"]')!.click();
    const items = [...host.querySelectorAll<HTMLElement>(".ctx-item")];
    items.find((it) => it.textContent === "Pronto")!.click();
    expect(findNode(state.area, id)?.status).toBe("pronto");
    done();
  });

  it("Foco toggles focus mode, and the exit button leaves it again", async () => {
    await openNew();
    const { host, done } = mounted();
    expect(state.focus).toBe(false);
    host.querySelector<HTMLButtonElement>('[aria-label="Foco"]')!.click();
    expect(state.focus).toBe(true);
    host.querySelector<HTMLButtonElement>('[aria-label="Sair do foco"]')!.click();
    expect(state.focus).toBe(false);
    done();
  });
});
