import { describe, expect, it } from "vitest";
import { answerConfirm, askConfirm, pendingConfirm } from "./confirm";

const opts = { title: "Excluir?", message: "Some.", confirmLabel: "Excluir", danger: true };

describe("askConfirm", () => {
  it("resolves true on confirm and closes the dialog", async () => {
    const p = askConfirm(opts);
    expect(pendingConfirm()?.title).toBe("Excluir?");
    answerConfirm(true);
    expect(await p).toBe(true);
    expect(pendingConfirm()).toBeNull();
  });

  it("resolves false on cancel", async () => {
    const p = askConfirm(opts);
    answerConfirm(false);
    expect(await p).toBe(false);
  });

  it("keeps a single dialog: a new ask cancels the previous one", async () => {
    const first = askConfirm(opts);
    const second = askConfirm({ ...opts, title: "Outro?" });
    expect(await first).toBe(false);
    expect(pendingConfirm()?.title).toBe("Outro?");
    answerConfirm(true);
    expect(await second).toBe(true);
  });
});
