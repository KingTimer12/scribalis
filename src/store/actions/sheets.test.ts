import { describe, expect, it, vi } from "vitest";
import * as api from "../../api/sheets";
import { mockInvoke } from "../../api/mock";
import type { Sheets } from "../../api/types";
import { filterSheets } from "../../lib/sheets";
import { answerConfirm, pendingConfirm } from "../confirm";
import { flushAll } from "../saving";
import { state } from "../state";
import { newBook } from "../../test/newBook";
import { scheduleSheetName, scheduleSheetValue, setSheetValueNow } from "./sheetEdits";
import { createSheet, requestDeleteSheet, setBookTab, setSheetKind } from "./sheets";
import { addDraftField, draftLosses, removeDraftField, saveTemplate, startTemplateEdit, updateDraftField } from "./sheetTemplate";

const onDisk = () => mockInvoke<Sheets>("sheets_load", { bookId: state.book!.id });

describe("sheets", () => {
  it("the Fichas tab loads the starter templates the first time", async () => {
    await newBook();
    await setBookTab("sheets");
    expect(state.bookTab).toBe("sheets");
    expect(state.sheets?.templates.character.map((f) => f.label)).toContain("Aparência");
    expect(state.sheets?.sheets).toEqual([]);
  });

  it("a new character opens blank; typing saves after the debounce or on flush", async () => {
    await newBook();
    await setBookTab("sheets");
    await createSheet();
    const id = state.sheetSel!;
    expect(state.sheets?.sheets.find((s) => s.id === id)?.kind).toBe("character");
    scheduleSheetName(id, "Ana Lírio");
    scheduleSheetValue(id, "aparencia", "Alta, cabelo curto");
    await setSheetValueNow(id, "vivo", true);
    await setSheetValueNow(id, "papel", "Protagonista");
    await flushAll();
    const saved = (await onDisk()).sheets[0];
    expect(saved.name).toBe("Ana Lírio");
    expect(saved.values).toEqual({ aparencia: "Alta, cabelo curto", vivo: true, papel: "Protagonista" });
  });

  it("places live apart from characters", async () => {
    await newBook();
    await setBookTab("sheets");
    await createSheet();
    await setSheetKind("place");
    await createSheet();
    scheduleSheetName(state.sheetSel!, "Vael");
    await flushAll();
    expect(filterSheets(state.sheets!, "place", "").map((s) => s.name)).toEqual(["Vael"]);
    expect(filterSheets(state.sheets!, "character", "")).toHaveLength(1);
    expect(filterSheets(state.sheets!, "place", "vaél")).toHaveLength(1);
  });

  it("deleting asks first", async () => {
    await newBook();
    await setBookTab("sheets");
    await createSheet();
    const id = state.sheetSel!;
    const done = requestDeleteSheet(id);
    await vi.waitFor(() => expect(pendingConfirm()).toBeTruthy());
    answerConfirm(true);
    await done;
    expect(state.sheets?.sheets).toEqual([]);
    expect(state.sheetSel).toBeNull();
  });

  it("the template draft saves new fields, and every card follows it", async () => {
    await newBook();
    await setBookTab("sheets");
    await createSheet();
    const id = state.sheetSel!;
    await setSheetValueNow(id, "papel", "Figurante");
    await startTemplateEdit();
    addDraftField();
    const last = state.templateDraft!.length - 1;
    updateDraftField(last, { label: "Raça", type: "select", options: ["Humano", "", "Elfo"] });
    const spy = vi.spyOn(api, "sheetsSetTemplate");
    await saveTemplate();
    expect(spy).toHaveBeenCalled();
    expect(state.templateDraft).toBeNull();
    const raca = state.sheets!.templates.character[state.sheets!.templates.character.length - 1];
    expect(raca).toMatchObject({ label: "Raça", type: "select", options: ["Humano", "Elfo"] });
    expect(raca.id).not.toBe("");
    expect(state.sheets!.sheets[0].values.papel).toBe("Figurante");
    spy.mockRestore();
  });

  it("removing a filled-in field asks before throwing its values away", async () => {
    await newBook();
    await setBookTab("sheets");
    await createSheet();
    await setSheetValueNow(state.sheetSel!, "papel", "Figurante");
    await startTemplateEdit();
    removeDraftField(0);
    expect(draftLosses(state.sheets!, "character", state.templateDraft!)).toEqual([{ field: "Papel", sheets: 1 }]);
    const done = saveTemplate();
    await vi.waitFor(() => expect(pendingConfirm()).toBeTruthy());
    answerConfirm(false);
    await done;
    expect(state.templateDraft).not.toBeNull();
    expect((await onDisk()).templates.character[0].id).toBe("papel");
  });
});
