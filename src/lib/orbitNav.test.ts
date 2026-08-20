import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demoSeed";
import { layoutOrbitWorld } from "./orbitLayout";
import {
  navigateOrbit,
  pickInDirection,
  type OrbitNavPoint,
} from "./orbitNav";

describe("spatial navigateOrbit", () => {
  const snap = demoSnapshot();
  const { world } = layoutOrbitWorld(snap.nodes, "c1");
  const pts: OrbitNavPoint[] = world.map((n) => ({
    id: n.id,
    x: n.x,
    y: n.y,
  }));

  const pos = (id: string) => pts.find((p) => p.id === id)!;

  it("layout: root below children (y grows down; root at 0, child y < 0)", () => {
    // c1 at origin; c2 opens upward → negative y
    expect(pos("c1").y).toBe(0);
    expect(pos("c2").y).toBeLessThan(pos("c1").y);
  });

  it("from root, ↑ goes to node that is visually above (c2)", () => {
    // User expects Up toward 范畴论入门 which sits above the hub
    expect(
      navigateOrbit(pts, "c1", { type: "key", key: "ArrowUp" }),
    ).toBe("c2");
  });

  it("from c2, ↓ goes back toward root below", () => {
    expect(
      navigateOrbit(pts, "c2", { type: "key", key: "ArrowDown" }),
    ).toBe("c1");
  });

  it("from c2, ↑ goes to a node above on the outer ring", () => {
    const next = navigateOrbit(pts, "c2", { type: "key", key: "ArrowUp" });
    expect(pos(next).y).toBeLessThan(pos("c2").y);
  });

  it("left/right pick spatially left/right neighbors", () => {
    // c3 / c4 / c5 fan around c2; from the middle-ish pick left and right
    const from = "c4"; // often near top of fan
    const left = navigateOrbit(pts, from, { type: "key", key: "ArrowLeft" });
    const right = navigateOrbit(pts, from, { type: "key", key: "ArrowRight" });
    if (left !== from) {
      expect(pos(left).x).toBeLessThan(pos(from).x + 1e-6);
    }
    if (right !== from) {
      expect(pos(right).x).toBeGreaterThan(pos(from).x - 1e-6);
    }
  });

  it("wheel maps to the same spatial axes", () => {
    // wheel up (dy < 0) = ArrowUp
    expect(
      navigateOrbit(pts, "c1", { type: "wheel", dx: 0, dy: -10 }),
    ).toBe(
      navigateOrbit(pts, "c1", { type: "key", key: "ArrowUp" }),
    );
    expect(
      navigateOrbit(pts, "c2", { type: "wheel", dx: 0, dy: 10 }),
    ).toBe(
      navigateOrbit(pts, "c2", { type: "key", key: "ArrowDown" }),
    );
  });

  it("pickInDirection ignores points behind the focus", () => {
    const points: OrbitNavPoint[] = [
      { id: "a", x: 0, y: 0 },
      { id: "above", x: 0, y: -10 },
      { id: "below", x: 0, y: 10 },
    ];
    expect(pickInDirection(points, "a", "ArrowUp")).toBe("above");
    expect(pickInDirection(points, "a", "ArrowDown")).toBe("below");
    expect(pickInDirection(points, "above", "ArrowUp")).toBe("above"); // nowhere further up
  });

  it("stays put when nothing lies in that direction", () => {
    const points: OrbitNavPoint[] = [
      { id: "only", x: 0, y: 0 },
      { id: "right", x: 5, y: 0 },
    ];
    expect(pickInDirection(points, "only", "ArrowLeft")).toBe("only");
    expect(pickInDirection(points, "only", "ArrowRight")).toBe("right");
  });
});
