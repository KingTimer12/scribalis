import { describe, expect, it } from "vitest";
import { themeButton } from "./theme";

describe("themeButton", () => {
  it("shows a moon in the light theme and a sun in the dark one, naming the theme a click gives", () => {
    expect(themeButton("light")).toEqual({ icon: "moon", label: "Tema escuro" });
    expect(themeButton("dark")).toEqual({ icon: "sun", label: "Tema claro" });
  });
});
