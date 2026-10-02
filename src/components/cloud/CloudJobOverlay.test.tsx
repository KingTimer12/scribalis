import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { applyCloudProgress, failCloudJob, finishCloudJob, startCloudJob } from "../../store/actions/cloudJob";
import { setState, state } from "../../store/state";
import { CloudJobOverlay } from "./CloudJobOverlay";

function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <CloudJobOverlay />, host);
  return { host, dispose };
}

describe("CloudJobOverlay", () => {
  afterEach(() => {
    setState("cloudJob", null);
    document.body.innerHTML = "";
  });

  it("a restore shows its checklist, then the done card that Enter dismisses", () => {
    startCloudJob("restore", "b1");
    applyCloudProgress({ bookId: "b1", step: "saving", done: 0, total: 0 });
    const { host, dispose } = mount();
    expect(host.querySelector(".cj-title")?.textContent).toBe("Restaurando da nuvem");
    expect([...host.querySelectorAll(".cj-steps li.ok")].map((li) => li.textContent)).toEqual(["Baixar a cópia"]);
    expect(host.querySelector(".cj-steps li.now")?.textContent).toBe("Guardar a versão atual");
    finishCloudJob("Pronto.");
    expect(host.querySelector(".cj-title")?.textContent).toBe("Cópia restaurada!");
    expect(host.querySelectorAll(".cj-steps li.ok")).toHaveLength(4);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(state.cloudJob).toBeNull();
    dispose();
  });

  it("a failed close offers to retry or close anyway, and Esc does not hide it", () => {
    startCloudJob("close", null);
    failCloudJob("«Obra»: sem internet");
    const { host, dispose } = mount();
    const labels = [...host.querySelectorAll(".cj-actions button")].map((b) => b.textContent);
    expect(labels).toEqual(["Fechar mesmo assim", "Tentar de novo"]);
    expect(host.querySelector(".cj-safe")).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(state.cloudJob?.phase).toBe("error");
    dispose();
  });
});
