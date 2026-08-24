import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demoSeed";
import { PALETTE_RESULT_CAP, rankPaletteNodes } from "./paletteRank";
import { stressFan } from "./stressSeed";

describe("rankPaletteNodes", () => {
  it("empty query does not dump full library", () => {
    const snap = stressFan(80);
    const { items, totalMatched } = rankPaletteNodes({
      nodes: snap.nodes,
      query: "",
      focusId: snap.focusId,
      recentIds: [snap.focusId],
      cap: PALETTE_RESULT_CAP,
    });
    expect(items.length).toBeLessThanOrEqual(PALETTE_RESULT_CAP);
    expect(items.length).toBeLessThan(snap.nodes.length);
    expect(totalMatched).toBeLessThan(snap.nodes.length);
  });

  it("query finds by title substring", () => {
    const snap = demoSnapshot();
    const { items } = rankPaletteNodes({
      nodes: snap.nodes,
      query: "函",
      focusId: snap.focusId,
      recentIds: [],
    });
    expect(items.some((n) => n.title.includes("函"))).toBe(true);
  });

  it("respects cap", () => {
    const snap = stressFan(80);
    const { items, totalMatched } = rankPaletteNodes({
      nodes: snap.nodes,
      query: "发散",
      focusId: snap.focusId,
      recentIds: [],
      cap: 10,
    });
    expect(items.length).toBeLessThanOrEqual(10);
    expect(totalMatched).toBeGreaterThan(items.length);
  });
});
