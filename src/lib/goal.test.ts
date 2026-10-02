import { describe, expect, it } from "vitest";
import { parseGoal } from "./goal";

describe("parseGoal", () => {
  it("reads plain numbers, thousands and the k / mil shorthands", () => {
    expect(parseGoal("1600")).toBe(1600);
    expect(parseGoal("1.600")).toBe(1600);
    expect(parseGoal("1,600")).toBe(1600);
    expect(parseGoal("1.5k")).toBe(1500);
    expect(parseGoal("1,6k")).toBe(1600);
    expect(parseGoal(" 2 K ")).toBe(2000);
    expect(parseGoal("2 mil")).toBe(2000);
    expect(parseGoal("12.000")).toBe(12000);
  });

  it("refuses text, odd separators and values out of range", () => {
    expect(parseGoal("")).toBeNull();
    expect(parseGoal("abc")).toBeNull();
    expect(parseGoal("1.5")).toBeNull();
    expect(parseGoal("1.2.3k")).toBeNull();
    expect(parseGoal("5")).toBeNull();
    expect(parseGoal("500k")).toBeNull();
  });
});
