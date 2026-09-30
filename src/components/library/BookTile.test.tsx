import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import type { BookSummary } from "../../api/types";
import { state } from "../../store/state";
import { BookTile } from "./BookTile";

const book: BookSummary = {
  id: "b1", title: "Obra de teste", author: "", cover: null, chapters: 1, words: 0, ready: 0, updatedAt: 0, cloud: false,
};

function mounted(onMenu: (x: number, y: number) => void) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <BookTile book={book} selected={false} onMenu={onMenu} />, host);
  return { host, done: () => (dispose(), host.remove()) };
}

describe("BookTile", () => {
  it("the '⋯' button opens the menu without opening the book", () => {
    const onMenu = vi.fn();
    const { host, done } = mounted(onMenu);
    const curId = state.curId;
    host.querySelector<HTMLButtonElement>(".tile-more")!.click();
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(typeof onMenu.mock.calls[0][0]).toBe("number");
    expect(typeof onMenu.mock.calls[0][1]).toBe("number");
    // Clicking the overlay button never reaches the cover button's own "Abrir" handler.
    expect(state.curId).toBe(curId);
    done();
  });

  it("right click opens the menu too", () => {
    const onMenu = vi.fn();
    const { host, done } = mounted(onMenu);
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 20 });
    host.querySelector<HTMLElement>(".tile")!.dispatchEvent(ev);
    expect(onMenu).toHaveBeenCalledWith(10, 20);
    done();
  });
});
