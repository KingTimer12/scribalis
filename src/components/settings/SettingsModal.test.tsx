import { render } from "solid-js/web";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS } from "../../lib/constants";
import { closePanel, openBookPanel, openSettings } from "../../store/actions/ui";
import { setState, state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { BookPanel } from "./BookPanel";
import { SettingsModal } from "./SettingsModal";

function mounted(view: () => any = () => <SettingsModal />) {
  setState("prefs", { ...DEFAULT_PREFS });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const dispose = render(view, host);
  return { host, done: () => (dispose(), host.remove()) };
}

const tab = (host: HTMLElement, label: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>(".setm-tab")).find((b) => b.textContent?.startsWith(label))!;

const typeGoal = (host: HTMLElement, value: string) => {
  const input = host.querySelector<HTMLInputElement>("#set-goal")!;
  input.value = value;
  input.dispatchEvent(new InputEvent("input", { bubbles: true }));
  input.dispatchEvent(new FocusEvent("blur"));
  return input;
};

describe("SettingsModal", () => {
  it("is a dialog with a category sidebar; Aparência is the default", () => {
    setState("settingsTab", "appearance");
    const { host, done } = mounted();
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll(".setm-tab-label")).map((e) => e.textContent)).toEqual(["Aparência", "Escrita", "Nuvem"]);
    expect(host.querySelector(".setm-title")?.textContent).toBe("Aparência");
    expect(host.textContent).toContain("Tamanho do texto");
    done();
  });

  it("clicking a category swaps the content", () => {
    setState("settingsTab", "appearance");
    const { host, done } = mounted();
    tab(host, "Escrita").click();
    expect(state.settingsTab).toBe("writing");
    expect(host.querySelector(".setm-title")?.textContent).toBe("Escrita");
    expect(host.querySelector("#set-goal")).not.toBeNull();
    done();
  });

  it("clicking A+ increases the text size and Escuro switches the theme", () => {
    setState("settingsTab", "appearance");
    const { host, done } = mounted();
    const before = state.prefs.textPx;
    host.querySelector<HTMLButtonElement>('[aria-label="Aumentar texto"]')!.click();
    expect(state.prefs.textPx).toBe(before + 2);
    Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((b) => b.textContent === "Escuro")!.click();
    expect(state.prefs.theme).toBe("dark");
    done();
  });

  it("the daily goal takes any typed value, and refuses nonsense without changing it", () => {
    setState("settingsTab", "writing");
    const { host, done } = mounted();
    typeGoal(host, "1.5k");
    expect(state.prefs.goal).toBe(1500);
    typeGoal(host, "1600");
    expect(state.prefs.goal).toBe(1600);
    const input = typeGoal(host, "muito");
    expect(state.prefs.goal).toBe(1600);
    expect(input.getAttribute("aria-invalid")).toBe("true");
    Array.from(host.querySelectorAll<HTMLButtonElement>(".set-chip")).find((b) => b.textContent === "5.000")!.click();
    expect(state.prefs.goal).toBe(5000);
    done();
  });

  it("openSettings switches category while open; Ctrl Shift S without a book goes to Nuvem", () => {
    closePanel();
    openSettings("writing");
    expect([state.panel, state.settingsTab]).toEqual(["settings", "writing"]);
    openSettings("appearance");
    expect([state.panel, state.settingsTab]).toEqual(["settings", "appearance"]);
    closePanel();
    setState({ book: null, view: "library" });
    openBookPanel();
    expect([state.panel, state.settingsTab]).toEqual(["settings", "cloud"]);
    closePanel();
  });
});

describe("BookPanel", () => {
  it("holds the book's own settings, and the author field saves through setBookAuthor", async () => {
    await newBook();
    const { host, done } = mounted(() => <BookPanel />);
    for (const label of ["Autor", "Capa", "Separador de cena", "Moldura superior", "Moldura inferior"]) {
      expect(host.textContent).toContain(label);
    }
    const input = host.querySelector<HTMLInputElement>("#set-author")!;
    input.value = "Machado de Assis";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur"));
    expect(state.book?.author).toBe("Machado de Assis");
    done();
  });
});
