import { render } from "solid-js/web";
import { describe, expect, it, vi } from "vitest";
import { MentionCard } from "../components/editor/MentionCard";
import { mockInvoke } from "../api/mock";
import type { Sheets } from "../api/types";
import { tagPool } from "../lib/sheets";
import { newBook } from "../test/newBook";
import { scheduleSheetName, setSheetValueNow } from "./actions/sheetEdits";
import { createSheet, loadSheets, setSheetKind } from "./actions/sheets";
import { mentionOptions, mentionTarget, onMentionKey, onMentionQuery } from "./mentions";
import { flushAll } from "./saving";
import { state } from "./state";

async function bookWithSheets() {
  await newBook();
  await loadSheets();
  await createSheet();
  const ana = state.sheetSel!;
  scheduleSheetName(ana, "Ana Lírio");
  await setSheetKind("place");
  await createSheet();
  const vael = state.sheetSel!;
  scheduleSheetName(vael, "Vael");
  await flushAll();
  return { ana, vael };
}

const query = (q: string, pick = vi.fn()) => ({ from: 3, to: 3 + q.length, query: q, left: 0, bottom: 0, pick });

describe("references and tags", () => {
  it("a character is born in a place, and its tags never repeat", async () => {
    const { ana, vael } = await bookWithSheets();
    await setSheetValueNow(ana, "nascimento", vael);
    await setSheetValueNow(ana, "personalidade", ["Leal", "Teimosa"]);
    const saved = (await mockInvoke<Sheets>("sheets_load", { bookId: state.book!.id })).sheets.find((s) => s.id === ana)!;
    expect(saved.values.nascimento).toBe(vael);
    expect(tagPool(state.sheets!, "character", "personalidade")).toEqual(["Leal", "Teimosa"]);
    await setSheetValueNow(ana, "personalidade", ["Leal", "leal"]);
    const again = (await mockInvoke<Sheets>("sheets_load", { bookId: state.book!.id })).sheets.find((s) => s.id === ana)!;
    expect(again.values.personalidade).toEqual(["Leal"]);
  });
});

describe("@ menu", () => {
  it("offers named sheets, arrows move and Enter picks", async () => {
    const { ana } = await bookWithSheets();
    const pick = vi.fn();
    onMentionQuery(query("a", pick));
    expect(mentionOptions().map((s) => s.name)).toEqual(["Ana Lírio", "Vael"]);
    expect(onMentionKey("ArrowDown")).toBe(true);
    expect(onMentionKey("ArrowUp")).toBe(true);
    expect(onMentionKey("Enter")).toBe(true);
    expect(pick).toHaveBeenCalledWith(ana, "Ana Lírio");
    expect(mentionTarget(ana)).toEqual({ name: "Ana Lírio", kind: "character" });
  });

  it("Esc hides it for this @, and keys pass through with nothing to offer", async () => {
    await bookWithSheets();
    onMentionQuery(query("zz"));
    expect(onMentionKey("Enter")).toBe(false);
    onMentionQuery(query("V"));
    expect(onMentionKey("Escape")).toBe(true);
    onMentionQuery(query("Va"));
    expect(onMentionKey("Enter")).toBe(false);
  });
});

describe("mention card", () => {
  it("shows the sheet's fields when the pointer rests on a mention", async () => {
    vi.useFakeTimers();
    const { ana, vael } = await bookWithSheets();
    await setSheetValueNow(ana, "nascimento", vael);
    const host = document.createElement("div");
    host.innerHTML = `<div class="ed-body"><span class="mention" data-id="${ana}">@Ana</span></div>`;
    document.body.append(host);
    const dispose = render(() => <MentionCard />, document.body.appendChild(document.createElement("div")));
    host.querySelector(".mention")!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(400);
    const card = document.querySelector(".mcard")!;
    expect(card.querySelector(".sc-name")?.textContent).toBe("Ana Lírio");
    expect([...card.querySelectorAll("dd")].map((d) => d.textContent)).toContain("Vael");
    dispose();
    vi.useRealTimers();
    document.body.innerHTML = "";
  });
});
