/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  APPEARANCE_LS_KEY,
  DEFAULT_APPEARANCE,
  THEME_CRITICAL_BG,
  applyAppearanceToDocument,
  parseAppearance,
  readAppearance,
  writeAppearance,
  type AppearancePrefs,
} from "./appearance";

afterEach(() => {
  localStorage.removeItem(APPEARANCE_LS_KEY);
  const root = document.documentElement;
  delete root.dataset.theme;
  delete root.dataset.font;
  delete root.dataset.fontSize;
  root.style.backgroundColor = "";
});

describe("parseAppearance", () => {
  it("returns defaults for null / non-object / array", () => {
    expect(parseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance("paper")).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance([])).toEqual(DEFAULT_APPEARANCE);
  });

  it("falls back illegal enum fields per-key", () => {
    expect(
      parseAppearance({
        theme: "neon",
        font: "comic",
        fontSize: "xxl",
      }),
    ).toEqual(DEFAULT_APPEARANCE);

    expect(
      parseAppearance({
        theme: "ink",
        font: "nope",
        fontSize: "lg",
      }),
    ).toEqual({
      theme: "ink",
      font: "system",
      fontSize: "lg",
    });
  });

  it("accepts all valid enums", () => {
    const prefs: AppearancePrefs = {
      theme: "cinnabar",
      font: "kai",
      fontSize: "xl",
    };
    expect(parseAppearance(prefs)).toEqual(prefs);
  });

  it("accepts the five v3 themes", () => {
    for (const theme of [
      "vellum",
      "cyanotype",
      "wisteria",
      "walnut",
      "travertine",
    ] as const) {
      expect(
        parseAppearance({ theme, font: "system", fontSize: "md" }),
      ).toEqual({ theme, font: "system", fontSize: "md" });
      expect(THEME_CRITICAL_BG[theme]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("readAppearance / writeAppearance", () => {
  beforeEach(() => {
    localStorage.removeItem(APPEARANCE_LS_KEY);
  });

  it("read returns defaults when missing or illegal JSON", () => {
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    localStorage.setItem(APPEARANCE_LS_KEY, "{not-json");
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
    localStorage.setItem(APPEARANCE_LS_KEY, JSON.stringify({ theme: "x" }));
    expect(readAppearance()).toEqual(DEFAULT_APPEARANCE);
  });

  it("write normalizes then read round-trips", () => {
    writeAppearance({
      theme: "matcha",
      font: "hei",
      fontSize: "sm",
    });
    expect(JSON.parse(localStorage.getItem(APPEARANCE_LS_KEY)!)).toEqual({
      theme: "matcha",
      font: "hei",
      fontSize: "sm",
    });
    expect(readAppearance()).toEqual({
      theme: "matcha",
      font: "hei",
      fontSize: "sm",
    });
  });
});

describe("applyAppearanceToDocument", () => {
  it("writes dataset and critical backgroundColor", () => {
    applyAppearanceToDocument({
      theme: "ink",
      font: "mono",
      fontSize: "lg",
    });
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("ink");
    expect(root.dataset.font).toBe("mono");
    expect(root.dataset.fontSize).toBe("lg");
    // jsdom may serialize hex as rgb(); ink #0a0a0a
    expect(root.style.backgroundColor.replace(/\s/g, "").toLowerCase()).toMatch(
      /^(#0a0a0a|rgb\(10,10,10\))$/,
    );
    expect(THEME_CRITICAL_BG.ink).toBe("#0a0a0a");
  });

  it("invalid prefs apply as defaults", () => {
    applyAppearanceToDocument({
      theme: "bad",
      font: "bad",
      fontSize: "bad",
    } as unknown as AppearancePrefs);
    const root = document.documentElement;
    expect(root.dataset.theme).toBe("paper");
    expect(root.dataset.font).toBe("system");
    expect(root.dataset.fontSize).toBe("md");
    // paper #efe4d4
    expect(root.style.backgroundColor.replace(/\s/g, "").toLowerCase()).toMatch(
      /^(#efe4d4|rgb\(239,228,212\))$/,
    );
  });
});
