/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DOC_FRACTION_DEFAULT,
  DOC_FRACTION_MAX,
  DOC_FRACTION_MIN,
  DOC_SPLIT_RATIO_LS_KEY,
  DOC_WIDE_FRACTION,
  clampDocFraction,
  readStoredDocFraction,
  sanitizeMaterialFileName,
  writeStoredDocFraction,
} from "./splitRatio";

afterEach(() => {
  localStorage.removeItem(DOC_SPLIT_RATIO_LS_KEY);
});

describe("constants", () => {
  it("matches materials-rail split law", () => {
    expect(DOC_FRACTION_MIN).toBe(0.28);
    expect(DOC_FRACTION_MAX).toBe(0.72);
    expect(DOC_FRACTION_DEFAULT).toBe(0.42);
    expect(DOC_WIDE_FRACTION).toBe(0.68);
    expect(DOC_SPLIT_RATIO_LS_KEY).toBe("soit-doc-split-ratio");
  });
});

describe("clampDocFraction", () => {
  it("passes through values inside range", () => {
    expect(clampDocFraction(0.28)).toBe(0.28);
    expect(clampDocFraction(0.42)).toBe(0.42);
    expect(clampDocFraction(0.72)).toBe(0.72);
    expect(clampDocFraction(0.5)).toBe(0.5);
  });

  it("clamps below min and above max", () => {
    expect(clampDocFraction(0)).toBe(DOC_FRACTION_MIN);
    expect(clampDocFraction(-1)).toBe(DOC_FRACTION_MIN);
    expect(clampDocFraction(0.27)).toBe(DOC_FRACTION_MIN);
    expect(clampDocFraction(0.73)).toBe(DOC_FRACTION_MAX);
    expect(clampDocFraction(1)).toBe(DOC_FRACTION_MAX);
    expect(clampDocFraction(99)).toBe(DOC_FRACTION_MAX);
  });

  it("returns default for non-finite", () => {
    expect(clampDocFraction(Number.NaN)).toBe(DOC_FRACTION_DEFAULT);
    expect(clampDocFraction(Number.POSITIVE_INFINITY)).toBe(
      DOC_FRACTION_DEFAULT,
    );
    expect(clampDocFraction(Number.NEGATIVE_INFINITY)).toBe(
      DOC_FRACTION_DEFAULT,
    );
  });
});

describe("readStoredDocFraction / writeStoredDocFraction", () => {
  beforeEach(() => {
    localStorage.removeItem(DOC_SPLIT_RATIO_LS_KEY);
  });

  it("read returns default when missing or illegal", () => {
    expect(readStoredDocFraction()).toBe(DOC_FRACTION_DEFAULT);
    localStorage.setItem(DOC_SPLIT_RATIO_LS_KEY, "not-a-number");
    expect(readStoredDocFraction()).toBe(DOC_FRACTION_DEFAULT);
    localStorage.setItem(DOC_SPLIT_RATIO_LS_KEY, "");
    expect(readStoredDocFraction()).toBe(DOC_FRACTION_DEFAULT);
  });

  it("read clamps out-of-range stored values", () => {
    localStorage.setItem(DOC_SPLIT_RATIO_LS_KEY, "0.1");
    expect(readStoredDocFraction()).toBe(DOC_FRACTION_MIN);
    localStorage.setItem(DOC_SPLIT_RATIO_LS_KEY, "0.9");
    expect(readStoredDocFraction()).toBe(DOC_FRACTION_MAX);
  });

  it("write clamps then read round-trips", () => {
    writeStoredDocFraction(0.55);
    expect(localStorage.getItem(DOC_SPLIT_RATIO_LS_KEY)).toBe("0.55");
    expect(readStoredDocFraction()).toBe(0.55);

    writeStoredDocFraction(0.1);
    expect(localStorage.getItem(DOC_SPLIT_RATIO_LS_KEY)).toBe(
      String(DOC_FRACTION_MIN),
    );
    expect(readStoredDocFraction()).toBe(DOC_FRACTION_MIN);

    writeStoredDocFraction(0.99);
    expect(readStoredDocFraction()).toBe(DOC_FRACTION_MAX);
  });

  it("doc-wide fraction is display-only constant (not auto-persisted)", () => {
    expect(DOC_WIDE_FRACTION).toBe(0.68);
    expect(DOC_WIDE_FRACTION).toBeGreaterThanOrEqual(DOC_FRACTION_MIN);
    expect(DOC_WIDE_FRACTION).toBeLessThanOrEqual(DOC_FRACTION_MAX);
    // Helpers never write DOC_WIDE unless caller passes it explicitly.
    expect(localStorage.getItem(DOC_SPLIT_RATIO_LS_KEY)).toBeNull();
  });
});

describe("sanitizeMaterialFileName", () => {
  it("keeps a plain leaf name", () => {
    expect(sanitizeMaterialFileName("notes.md")).toBe("notes.md");
    expect(sanitizeMaterialFileName("  report.pdf  ")).toBe("report.pdf");
  });

  it("strips path segments and separators", () => {
    expect(sanitizeMaterialFileName("foo/bar/baz.md")).toBe("baz.md");
    expect(sanitizeMaterialFileName("foo\\bar\\baz.md")).toBe("baz.md");
    expect(sanitizeMaterialFileName("../secret.md")).toBe("secret.md");
    expect(sanitizeMaterialFileName("..\\..\\x.txt")).toBe("x.txt");
  });

  it("removes traversal and illegal characters", () => {
    expect(sanitizeMaterialFileName("a:b*c?.md")).toBe("abc.md");
    expect(sanitizeMaterialFileName("..")).toBe("untitled");
    expect(sanitizeMaterialFileName(".")).toBe("untitled");
    expect(sanitizeMaterialFileName("")).toBe("untitled");
    expect(sanitizeMaterialFileName("///")).toBe("untitled");
  });

  it("preserves extension when truncating long names", () => {
    const longStem = "a".repeat(200);
    const out = sanitizeMaterialFileName(`${longStem}.md`);
    expect(out.endsWith(".md")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(180);
    expect(out.startsWith("a")).toBe(true);
  });
});
