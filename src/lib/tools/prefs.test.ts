import { describe, expect, it } from "vitest";
import {
  defaultToolsPrefs,
  effectiveWebSearchBackend,
  normalizeToolsPrefs,
} from "./types";

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

  it("defaults web search button off", () => {
    expect(defaultToolsPrefs().webSearchEnabled).toBe(false);
  });

  it("webSearchEnabled true only when explicitly true", () => {
    expect(normalizeToolsPrefs({ webSearchEnabled: true }).webSearchEnabled).toBe(
      true,
    );
    expect(normalizeToolsPrefs({ webSearchEnabled: false }).webSearchEnabled).toBe(
      false,
    );
    expect(
      normalizeToolsPrefs({ webSearchEnabled: "yes" as unknown }).webSearchEnabled,
    ).toBe(false);
    expect(normalizeToolsPrefs({}).webSearchEnabled).toBe(false);
  });
});

describe("effectiveWebSearchBackend", () => {
  it("off when button off", () => {
    expect(
      effectiveWebSearchBackend({
        ...defaultToolsPrefs(),
        webSearchEnabled: false,
        webSearchBackend: "ddg",
      }),
    ).toBe("off");
  });

  it("falls back to ddg when on + backend off", () => {
    expect(
      effectiveWebSearchBackend({
        ...defaultToolsPrefs(),
        webSearchEnabled: true,
        webSearchBackend: "off",
      }),
    ).toBe("ddg");
  });

  it("keeps configured backend when on", () => {
    expect(
      effectiveWebSearchBackend({
        ...defaultToolsPrefs(),
        webSearchEnabled: true,
        webSearchBackend: "tavily",
      }),
    ).toBe("tavily");
  });
});
