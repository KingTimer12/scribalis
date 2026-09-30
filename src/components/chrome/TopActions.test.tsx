import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { closePanel } from "../../store/actions/ui";
import { state } from "../../store/state";
import { TopActions } from "./TopActions";

function mounted() {
  closePanel();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <TopActions />, host);
  return { host, done: () => (dispose(), host.remove()) };
}

describe("TopActions", () => {
  it("Comandos opens the palette", () => {
    const { host, done } = mounted();
    host.querySelector<HTMLButtonElement>('[aria-label="Comandos"]')!.click();
    expect(state.panel).toBe("palette");
    done();
  });

  it("Atalhos opens the help panel", () => {
    const { host, done } = mounted();
    host.querySelector<HTMLButtonElement>('[aria-label="Atalhos"]')!.click();
    expect(state.panel).toBe("help");
    done();
  });

  it("Ajustes opens the settings drawer", () => {
    const { host, done } = mounted();
    host.querySelector<HTMLButtonElement>('[aria-label="Ajustes"]')!.click();
    expect(state.panel).toBe("settings");
    done();
  });

  it("labels are collapsible (aria-label always present) and tooltips carry the shortcut", () => {
    const { host, done } = mounted();
    const comandos = host.querySelector<HTMLButtonElement>('[aria-label="Comandos"]')!;
    expect(comandos.title).toBe("Comandos (Ctrl K)");
    expect(comandos.querySelector(".bar-btn-label")!.textContent).toBe("Comandos");
    done();
  });
});
