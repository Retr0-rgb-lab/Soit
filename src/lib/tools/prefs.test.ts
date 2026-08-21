import { describe, expect, it } from "vitest";
import { defaultToolsPrefs, normalizeToolsPrefs } from "./types";

describe("normalizeToolsPrefs", () => {
  it("defaults web off", () => {
    expect(defaultToolsPrefs().webSearchBackend).toBe("off");
  });

  it("clamps rounds", () => {
    expect(normalizeToolsPrefs({ maxToolRounds: 99 }).maxToolRounds).toBe(5);
    expect(normalizeToolsPrefs({ maxToolRounds: 0 }).maxToolRounds).toBe(1);
  });

  it("rejects bad backend", () => {
    expect(normalizeToolsPrefs({ webSearchBackend: "x" }).webSearchBackend).toBe(
      "off",
    );
  });
});
