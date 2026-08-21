import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetExplainCacheForTests,
  clearExplainCacheForCard,
  explainCacheKey,
  getExplainCached,
  setExplainCached,
} from "./explainCache";

beforeEach(() => {
  __resetExplainCacheForTests();
});

describe("explainCache", () => {
  it("stores and hits within the same card", () => {
    setExplainCached("c1", "函子", "函子是…");
    expect(getExplainCached("c1", "函子")).toBe("函子是…");
    expect(getExplainCached("c1", "  函子  ")).toBe("函子是…");
  });

  it("does not leak across cards", () => {
    setExplainCached("c1", "函子", "A");
    expect(getExplainCached("c2", "函子")).toBeNull();
  });

  it("normalize key collapses whitespace", () => {
    expect(explainCacheKey("  a   b \n")).toBe("a b");
  });

  it("clearExplainCacheForCard drops only that card", () => {
    setExplainCached("c1", "x", "1");
    setExplainCached("c2", "x", "2");
    clearExplainCacheForCard("c1");
    expect(getExplainCached("c1", "x")).toBeNull();
    expect(getExplainCached("c2", "x")).toBe("2");
  });
});
