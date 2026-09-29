import type { Prefs } from "../api/types";

/** Face of the theme button: a moon in the light theme (a click goes dark), a sun in the dark one. */
export function themeButton(theme: Prefs["theme"]): { icon: "moon" | "sun"; label: string } {
  return theme === "dark" ? { icon: "sun", label: "Tema claro" } : { icon: "moon", label: "Tema escuro" };
}
