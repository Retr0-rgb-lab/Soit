import { describe, expect, it } from "vitest";
import { chromeFadeStyle, scrollChromeFade } from "./scrollChromeFade";

describe("scrollChromeFade", () => {
  it("0 at top", () => {
    expect(scrollChromeFade(0)).toBe(0);
  });
  it("1 past range", () => {
    expect(scrollChromeFade(200, 96)).toBe(1);
  });
  it("between", () => {
    const m = scrollChromeFade(48, 96);
    expect(m).toBeGreaterThan(0.2);
    expect(m).toBeLessThan(0.9);
  });
});

describe("chromeFadeStyle", () => {
  it("hides when nearly faded", () => {
    expect(chromeFadeStyle(1).visibility).toBe("hidden");
    expect(chromeFadeStyle(0).visibility).toBe("visible");
    expect(chromeFadeStyle(0).opacity).toBe(1);
  });
});
