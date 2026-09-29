import { describe, expect, it, vi } from "vitest";
import * as libraryApi from "../../api/library";
import { answerConfirm, pendingConfirm } from "../confirm";
import { setState, state } from "../state";
import { requestDeleteBook } from "./library";

async function withBook() {
  const created = await libraryApi.createBook("Livro de teste");
  setState("library", [{ ...created }]);
  return created.id;
}

describe("requestDeleteBook", () => {
  it("does not delete on cancel", async () => {
    const id = await withBook();
    const spy = vi.spyOn(libraryApi, "deleteBook");
    const done = requestDeleteBook(id);
    expect(pendingConfirm()?.title).toBe("Excluir o livro “Livro de teste”?");
    answerConfirm(false);
    await done;
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("deletes only after the user confirms", async () => {
    const id = await withBook();
    const spy = vi.spyOn(libraryApi, "deleteBook");
    const done = requestDeleteBook(id);
    expect(spy).not.toHaveBeenCalled();
    answerConfirm(true);
    await done;
    expect(spy).toHaveBeenCalledWith(id);
    expect(state.library.find((b) => b.id === id)).toBeUndefined();
    spy.mockRestore();
  });
});
