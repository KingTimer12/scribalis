import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "../../lib/constants";
import { setState, state } from "../../store/state";
import { SettingsPanel } from "./SettingsPanel";

function mounted() {
  setState("prefs", { ...DEFAULT_PREFS });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <SettingsPanel />, host);
  return { host, done: () => (dispose(), host.remove()) };
}

describe("SettingsPanel", () => {
  it("renders the Aparência and Escrita sections", () => {
    const { host, done } = mounted();
    expect(host.textContent).toContain("Ajustes");
    expect(host.textContent).toContain("Aparência");
    expect(host.textContent).toContain("Escrita");
    expect(host.textContent).toContain("Tema");
    expect(host.textContent).toContain("Tamanho do texto");
    expect(host.textContent).toContain("Tamanho da interface");
    expect(host.textContent).toContain("Largura do texto");
    expect(host.textContent).toContain("Meta diária");
    done();
  });

  it("clicking A+ increases the text size in the store", () => {
    const { host, done } = mounted();
    const before = state.prefs.textPx;
    host.querySelector<HTMLButtonElement>('[aria-label="Aumentar texto"]')!.click();
    expect(state.prefs.textPx).toBe(before + 2);
    done();
  });

  it("clicking the Escuro segment updates the theme pref", () => {
    const { host, done } = mounted();
    const escuro = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent === "Escuro")!;
    escuro.click();
    expect(state.prefs.theme).toBe("dark");
    done();
  });

  it("clicking the Larga segment updates the width pref", () => {
    const { host, done } = mounted();
    const larga = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent === "Larga")!;
    larga.click();
    expect(state.prefs.width).toBe(2);
    done();
  });

  it("clicking a Meta diária segment updates the goal pref", () => {
    const { host, done } = mounted();
    const opt = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent === "5.000")!;
    opt.click();
    expect(state.prefs.goal).toBe(5000);
    done();
  });
});
