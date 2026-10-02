import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { openPanel } from "../../store/actions/ui";
import { state } from "../../store/state";
import { HelpPanel } from "./HelpPanel";

function mounted() {
  openPanel("help");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(() => <HelpPanel />, host);
  return { host, done: () => (dispose(), host.remove()) };
}

describe("HelpPanel", () => {
  it("shows the buttons-over-shortcuts note", () => {
    const { host, done } = mounted();
    expect(host.textContent).toContain("Tudo aqui também tem botão ou menu; os atalhos são opcionais.");
    done();
  });

  it("clicking a runnable row (Configurações) opens the settings modal and leaves help", () => {
    const { host, done } = mounted();
    const row = [...host.querySelectorAll<HTMLButtonElement>("button.help-row-btn")].find((b) => b.textContent?.includes("Configurações (tema, meta, nuvem)"))!;
    row.click();
    expect(state.panel).toBe("settings");
    done();
  });

  it("clicking a runnable row (Fechar e voltar) closes the panel", () => {
    const { host, done } = mounted();
    const row = [...host.querySelectorAll<HTMLButtonElement>("button.help-row-btn")].find((b) => b.textContent?.includes("Fechar e voltar"))!;
    row.click();
    expect(state.panel).toBe(null);
    done();
  });

  it("a widget-scoped shortcut (tree rename) stays text-only, not a button", () => {
    const { host, done } = mounted();
    const row = [...host.querySelectorAll(".help-row")].find((el) => el.textContent?.includes("Árvore: renomear"))!;
    expect(row.tagName).toBe("DIV");
    done();
  });
});
