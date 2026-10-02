import { render } from "solid-js/web";
import { afterEach, describe, expect, it } from "vitest";
import { cardPreview, initials } from "../../lib/sheets";
import { setSheetValueNow } from "../../store/actions/sheetEdits";
import { createSheet, openSheet, setBookTab } from "../../store/actions/sheets";
import { startTemplateEdit } from "../../store/actions/sheetTemplate";
import { state } from "../../store/state";
import { newBook } from "../../test/newBook";
import { SheetsView } from "./SheetsView";

async function mount() {
  await newBook();
  await setBookTab("sheets");
  const host = document.createElement("div");
  document.body.append(host);
  const dispose = render(() => <SheetsView />, host);
  return { host, dispose };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("SheetsView", () => {
  afterEach(() => (document.body.innerHTML = ""));

  it("starts empty, then shows a card with its filled-in fields", async () => {
    const { host, dispose } = await mount();
    expect(host.querySelector(".sheets-start")?.textContent).toContain("Nenhum personagem ainda.");
    await createSheet();
    const id = state.sheetSel!;
    await setSheetValueNow(id, "papel", "Protagonista");
    await setSheetValueNow(id, "vivo", false);
    await openSheet(null);
    await tick();
    const card = host.querySelector(".sc")!;
    expect(card.querySelector(".sc-name")?.textContent).toBe("Sem nome");
    expect([...card.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["Protagonista", "Não"]);
    expect(host.querySelector(".sheets-kind.on .sheets-count")?.textContent).toBe("1");
    dispose();
  });

  it("the form draws each field by its type", async () => {
    const { host, dispose } = await mount();
    await createSheet();
    await tick();
    const types = [...host.querySelectorAll(".sf")].map((el) => (el as HTMLElement).dataset.type);
    expect(types).toEqual(["select", "input", "reference", "textarea", "tags", "reference", "boolean"]);
    const sw = host.querySelector<HTMLButtonElement>(".sf-switch")!;
    expect(sw.getAttribute("aria-checked")).toBe("false");
    sw.click();
    await tick();
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(state.sheets!.sheets[0].values.vivo).toBe(true);
    dispose();
  });

  it("a tag typed in another spelling reuses the existing one, and Backspace takes the last", async () => {
    const { host, dispose } = await mount();
    await createSheet();
    await setSheetValueNow(state.sheetSel!, "personalidade", ["Corajosa"]);
    await createSheet();
    await tick();
    const input = host.querySelector<HTMLInputElement>("#sf-personalidade")!;
    const type = (v: string, key: string) => {
      input.value = v;
      input.dispatchEvent(new InputEvent("input", { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    };
    type("corajosa", "Enter");
    type("nova", ",");
    await tick();
    const sheet = () => state.sheets!.sheets.find((s) => s.id === state.sheetSel)!;
    expect(sheet().values.personalidade).toEqual(["Corajosa", "nova"]);
    type("", "Backspace");
    await tick();
    expect(sheet().values.personalidade).toEqual(["Corajosa"]);
    dispose();
  });

  it("the Molde button opens the template editor with one row per field", async () => {
    const { host, dispose } = await mount();
    await startTemplateEdit();
    await tick();
    expect(host.querySelector(".tpl-title")?.textContent).toBe("Molde de personagem");
    expect(host.querySelectorAll(".tpl-row")).toHaveLength(7);
    expect(host.querySelectorAll(".tpl-options")).toHaveLength(1);
    dispose();
  });
});

describe("sheet helpers", () => {
  it("initials and previews", () => {
    expect(initials("ana maria lírio")).toBe("AL");
    expect(initials("  ")).toBe("?");
    const sheet = { id: "s", kind: "character" as const, name: "", values: { b: "linha\n  dois", a: true } };
    const template = [
      { id: "a", label: "Vivo", type: "boolean" as const },
      { id: "b", label: "Nota", type: "textarea" as const },
    ];
    expect(cardPreview(sheet, template, () => undefined)).toEqual([
      { label: "Vivo", value: "Sim" },
      { label: "Nota", value: "linha dois" },
    ]);
  });
});
