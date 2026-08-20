import { describe, expect, it } from "vitest";
import {
  clampPipGeom,
  defaultPipGeom,
  initialCardPipState,
  pipGeomAtPointer,
  reduceCardPip,
} from "./cardPip";

describe("defaultPipGeom", () => {
  it("stays fully inside viewport", () => {
    const g = defaultPipGeom(1000, 800);
    expect(g.x + g.w).toBeLessThanOrEqual(1000 - 8);
    expect(g.y + g.h).toBeLessThanOrEqual(800 - 8);
    expect(g.x).toBeGreaterThanOrEqual(8);
    expect(g.y).toBeGreaterThanOrEqual(8);
  });
});

describe("clampPipGeom", () => {
  it("pulls overflow back in", () => {
    const g = clampPipGeom({ x: 9000, y: -40, w: 300, h: 180 }, 1000, 800);
    expect(g.x + g.w).toBeLessThanOrEqual(1000 - 8);
    expect(g.y).toBeGreaterThanOrEqual(8);
  });
});

describe("pipGeomAtPointer", () => {
  it("centers on pointer then clamps", () => {
    const g = pipGeomAtPointer(500, 400, 1000, 800);
    expect(g.x + g.w / 2).toBeCloseTo(500, 0);
    expect(g.y + g.h / 2).toBeCloseTo(400, 0);
    const edge = pipGeomAtPointer(5, 5, 1000, 800);
    expect(edge.x).toBeGreaterThanOrEqual(8);
    expect(edge.y).toBeGreaterThanOrEqual(8);
  });
});

describe("reduceCardPip", () => {
  it("grab → drag → hold_pip → settled → expand → done", () => {
    let s = initialCardPipState();
    s = reduceCardPip(s, { type: "grab" });
    expect(s.mode).toBe("dragging");
    s = reduceCardPip(s, { type: "move", dx: 10, dy: 20 });
    expect(s.peelDy).toBe(20);
    s = reduceCardPip(s, {
      type: "hold_pip",
      cardId: "c3",
      from: { x: 100, y: 80, w: 600, h: 400 },
      anchorX: 600,
      anchorY: 400,
      vw: 1200,
      vh: 800,
    });
    expect(s.mode).toBe("pip");
    expect(s.session?.cardId).toBe("c3");
    expect(s.session?.phase).toBe("entering");
    expect(s.session!.x + s.session!.w / 2).toBeCloseTo(600, 0);
    expect(s.session!.y + s.session!.h / 2).toBeCloseTo(400, 0);
    s = reduceCardPip(s, { type: "pip_settle" });
    expect(s.session?.phase).toBe("settled");
    s = reduceCardPip(s, { type: "expand_start" });
    expect(s.session?.phase).toBe("expanding");
    s = reduceCardPip(s, { type: "pip_done" });
    expect(s.mode).toBe("idle");
    expect(s.session).toBeNull();
  });

  it("close path", () => {
    let s = reduceCardPip(initialCardPipState(), { type: "grab" });
    s = reduceCardPip(s, {
      type: "hold_pip",
      cardId: "c1",
      from: { x: 0, y: 0, w: 100, h: 100 },
      anchorX: 200,
      anchorY: 200,
      vw: 800,
      vh: 600,
    });
    s = reduceCardPip(s, { type: "close_start" });
    expect(s.session?.phase).toBe("closing");
    s = reduceCardPip(s, { type: "pip_done" });
    expect(s.mode).toBe("idle");
  });
});
