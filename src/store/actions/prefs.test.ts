import { describe, expect, it } from "vitest";
import { getPrefs } from "../../api/prefs";
import { DEFAULT_PREFS } from "../../lib/constants";
import { themeButton } from "../../lib/theme";
import { setState, state } from "../state";
import { cycleUiScale, setUiScale, textBigger, textReset, textSmaller, toggleTheme } from "./prefs";

describe("theme toggle", () => {
  it("switches the theme and the icon, and saves the preference", async () => {
    setState("prefs", { ...DEFAULT_PREFS, theme: "light" });
    toggleTheme();
    expect(state.prefs.theme).toBe("dark");
    expect(themeButton(state.prefs.theme).icon).toBe("sun");
    expect((await getPrefs()).theme).toBe("dark");
    toggleTheme();
    expect(themeButton(state.prefs.theme).icon).toBe("moon");
    expect((await getPrefs()).theme).toBe("light");
  });
});

describe("text and interface size", () => {
  it("steps the text size by 2 px and stops at 14 and 32", async () => {
    setState("prefs", { ...DEFAULT_PREFS, textPx: 28 });
    textBigger();
    expect(state.prefs.textPx).toBe(30);
    textBigger();
    textBigger();
    expect(state.prefs.textPx).toBe(32);
    expect((await getPrefs()).textPx).toBe(32);
    setState("prefs", { ...DEFAULT_PREFS, textPx: 16 });
    textSmaller();
    textSmaller();
    textSmaller();
    expect(state.prefs.textPx).toBe(14);
  });

  it("reset brings the text back to 20 px", async () => {
    setState("prefs", { ...DEFAULT_PREFS, textPx: 30 });
    textReset();
    expect(state.prefs.textPx).toBe(20);
    expect((await getPrefs()).textPx).toBe(20);
  });

  it("sets and cycles the interface size within 0..2", async () => {
    setState("prefs", { ...DEFAULT_PREFS, uiScale: 0 });
    setUiScale(2);
    expect(state.prefs.uiScale).toBe(2);
    expect((await getPrefs()).uiScale).toBe(2);
    setUiScale(9);
    expect(state.prefs.uiScale).toBe(2);
    cycleUiScale();
    expect(state.prefs.uiScale).toBe(0);
    cycleUiScale();
    expect(state.prefs.uiScale).toBe(1);
  });
});
