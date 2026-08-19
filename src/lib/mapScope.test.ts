import { describe, expect, it } from "vitest";
import { layoutGraph } from "./graphLayout";
import {
  DEFAULT_MAP_CAPS,
  isAggregateId,
  mapAtlasNodes,
  mapConeNodes,
  mapWorkingNodes,
} from "./mapScope";
import { stressDeep, stressFan } from "./stressSeed";

describe("mapConeNodes", () => {
  it("keeps full ancestor chain", () => {
    const snap = stressDeep(10);
    const views = mapConeNodes(snap.nodes, snap.focusId);
    const pathIds = views.filter((v) => v.role === "path" || v.role === "focus");
    expect(pathIds.length).toBe(11); // root + 10 deepen
  });

  it("aggregates fan-out over sibling/child cap", () => {
    const snap = stressFan(80);
    const views = mapConeNodes(snap.nodes, "sf-mid", DEFAULT_MAP_CAPS);
    const aggs = views.filter((v) => v.role === "aggregate");
    expect(aggs.length).toBeGreaterThanOrEqual(1);
    expect(views.length).toBeLessThanOrEqual(DEFAULT_MAP_CAPS.hardCap);

    for (const a of aggs) {
      expect(isAggregateId(a.id)).toBe(true);
      expect(a.parentId).toBeTruthy();
      expect(views.some((v) => v.id === a.parentId)).toBe(true);
      const ids = new Set(views.map((v) => v.id));
      for (const rid of a.representsIds ?? []) {
        expect(ids.has(rid)).toBe(false);
      }
    }
  });
});

describe("mapWorkingNodes", () => {
  it("includes focus and full path after clamp", () => {
    const snap = stressFan(80);
    const recent = snap.nodes.slice(0, 20).map((n) => n.id);
    const views = mapWorkingNodes(
      snap.nodes,
      "sf-mid",
      recent,
      DEFAULT_MAP_CAPS,
    );
    expect(views.length).toBeLessThanOrEqual(DEFAULT_MAP_CAPS.hardCap);
    expect(views.some((v) => v.id === "sf-mid" && v.role === "focus")).toBe(
      true,
    );
    expect(views.some((v) => v.id === "sf-root" && v.role === "path")).toBe(
      true,
    );
  });
});

describe("mapAtlasNodes", () => {
  it("emits roots and proxies", () => {
    const snap = stressFan(20);
    const views = mapAtlasNodes(snap.nodes, snap.focusId);
    expect(views.some((v) => v.id === "sf-root")).toBe(true);
    expect(views.some((v) => v.role === "aggregate")).toBe(true);
  });
});

describe("layoutGraph depth", () => {
  it("stressDeep(40) y increases with depth", () => {
    const snap = stressDeep(40);
    const laid = layoutGraph(snap.nodes);
    const ordered = [...laid].sort((a, b) => {
      const da = Number(a.id.split("-")[1]);
      const db = Number(b.id.split("-")[1]);
      return da - db;
    });
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i]!.y).toBeGreaterThan(ordered[i - 1]!.y);
    }
  });
});
