import { describe, expect, it } from "vitest";
import { getPrefs } from "../../api/prefs";
import { DEFAULT_PREFS } from "../../lib/constants";
import { themeButton } from "../../lib/theme";
import { setState, state } from "../state";
import { toggleTheme } from "./prefs";

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
