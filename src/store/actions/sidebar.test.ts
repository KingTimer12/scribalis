import { describe, expect, it } from "vitest";
import { getPrefs } from "../../api/prefs";
import type { BookMeta } from "../../api/types";
import { DEFAULT_PREFS } from "../../lib/constants";
import { setState } from "../state";
import { sidebarOpen, toggleSidebar } from "./sidebar";

const book = (id: string): BookMeta => ({
  id, title: "", author: "", open: null, updatedAt: 0, dir: "", cover: null, header: null, footer: null,
  separator: { type: "text", text: "* * *" },
});

describe("sidebar", () => {
  it("is open by default and remembers a collapse per book, in the prefs", async () => {
    setState({ view: "book", book: book("b1"), prefs: { ...DEFAULT_PREFS, sidebarClosed: [] } });
    expect(sidebarOpen()).toBe(true);
    toggleSidebar();
    expect(sidebarOpen()).toBe(false);
    expect((await getPrefs()).sidebarClosed).toContain("b1");
    // Another book keeps its own state.
    setState("book", book("b2"));
    expect(sidebarOpen()).toBe(true);
    setState("book", book("b1"));
    toggleSidebar();
    expect(sidebarOpen()).toBe(true);
    expect((await getPrefs()).sidebarClosed).not.toContain("b1");
  });
});
