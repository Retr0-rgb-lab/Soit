import { describe, expect, it } from "vitest";
import type { InquiryNode } from "../types";
import { demoSnapshot } from "./demoSeed";
import {
  buildOrbitModel,
  childrenOf,
  layoutOrbitWorld,
} from "./orbitLayout";

function node(
  partial: Pick<InquiryNode, "id" | "title" | "parentId" | "kind"> &
    Partial<InquiryNode>,
): InquiryNode {
  return {
    unread: false,
    ...partial,
  };
}

describe("childrenOf", () => {
  it("sorts deepen before diverge then by id", () => {
    const nodes: InquiryNode[] = [
      node({ id: "r", title: "root", parentId: null, kind: "root" }),
      node({ id: "d2", title: "div-b", parentId: "r", kind: "diverge" }),
      node({ id: "e1", title: "deep-b", parentId: "r", kind: "deepen" }),
      node({ id: "d1", title: "div-a", parentId: "r", kind: "diverge" }),
      node({ id: "e0", title: "deep-a", parentId: "r", kind: "deepen" }),
    ];
    expect(childrenOf(nodes, "r").map((n) => n.id)).toEqual([
      "e0",
      "e1",
      "d1",
      "d2",
    ]);
  });
});

describe("buildOrbitModel — focus-local cone", () => {
  it("returns empty hub for unknown focus", () => {
    const model = buildOrbitModel([], "missing");
    expect(model.hub).toBeNull();
    expect(model.center).toBeNull();
    expect(model.rootId).toBeNull();
    expect(model.focusId).toBe("missing");
    expect(model.layer).toEqual([]);
    expect(model.children).toEqual([]);
  });

  it("at root: hub is focus; ring1 = children (next depth)", () => {
    const nodes: InquiryNode[] = [
      node({ id: "r", title: "Root", parentId: null, kind: "root" }),
      node({ id: "div", title: "Diverge", parentId: "r", kind: "diverge", unread: true }),
      node({ id: "dep", title: "Deepen", parentId: "r", kind: "deepen" }),
    ];
    const model = buildOrbitModel(nodes, "r");
    expect(model.hub?.id).toBe("r");
    expect(model.hubIsFocus).toBe(true);
    expect(model.layer.map((i) => i.id)).toEqual(["dep", "div"]);
    expect(model.children).toEqual([]);
  });

  it("alone root has empty rings", () => {
    const nodes = [node({ id: "r", title: "Alone", parentId: null, kind: "root" })];
    const model = buildOrbitModel(nodes, "r");
    expect(model.hub?.id).toBe("r");
    expect(model.hubIsFocus).toBe(true);
    expect(model.layer).toEqual([]);
  });

  it("focus c3: hub = parent c2; layer = siblings c3/c4/c5 (same depth)", () => {
    const snap = demoSnapshot();
    const atC3 = buildOrbitModel(snap.nodes, "c3");
    expect(atC3.hub?.id).toBe("c2");
    expect(atC3.hubIsFocus).toBe(false);
    expect(atC3.center?.id).toBe("c2"); // alias
    // same layer under 范畴论入门 — NOT global root as hub
    expect(atC3.layer.map((i) => i.id)).toEqual(["c3", "c4", "c5"]);
    expect(atC3.children.map((i) => i.id)).toEqual(["c6"]);
  });

  it("focus c2: hub = c1; layer = [c2]; children = c3/c4/c5", () => {
    const snap = demoSnapshot();
    const atC2 = buildOrbitModel(snap.nodes, "c2");
    expect(atC2.hub?.id).toBe("c1");
    expect(atC2.hubIsFocus).toBe(false);
    expect(atC2.layer.map((i) => i.id)).toEqual(["c2"]);
    expect(atC2.children.map((i) => i.id)).toEqual(["c3", "c4", "c5"]);
  });

  it("focus c4 diverge: still hub c2, same layer as 函子", () => {
    const snap = demoSnapshot();
    const atC4 = buildOrbitModel(snap.nodes, "c4");
    expect(atC4.hub?.id).toBe("c2");
    expect(atC4.layer.map((i) => i.id)).toEqual(["c3", "c4", "c5"]);
    expect(atC4.focusId).toBe("c4");
  });

  it("respects ringCap", () => {
    const nodes: InquiryNode[] = [
      node({ id: "r", title: "Root", parentId: null, kind: "root" }),
      ...Array.from({ length: 10 }, (_, i) =>
        node({
          id: `k${i}`,
          title: `Kid ${i}`,
          parentId: "r",
          kind: i % 2 === 0 ? "deepen" : "diverge",
        }),
      ),
    ];
    const model = buildOrbitModel(nodes, "r", { ringCap: 3 });
    expect(model.layer).toHaveLength(3);
  });

  it("world layout is stable across focus changes", () => {
    const snap = demoSnapshot();
    const a = layoutOrbitWorld(snap.nodes, "c1");
    const b = layoutOrbitWorld(snap.nodes, "c1");
    const pos = (w: typeof a, id: string) => {
      const n = w.world.find((x) => x.id === id)!;
      return { x: n.x, y: n.y };
    };
    expect(pos(a, "c3")).toEqual(pos(b, "c3"));
    // siblings share same depth / radius
    const c3 = a.world.find((n) => n.id === "c3")!;
    const c4 = a.world.find((n) => n.id === "c4")!;
    const c5 = a.world.find((n) => n.id === "c5")!;
    expect(c3.depth).toBe(c4.depth);
    expect(c4.depth).toBe(c5.depth);
    const r = (n: { x: number; y: number }) => Math.hypot(n.x, n.y);
    expect(Math.abs(r(c3) - r(c4))).toBeLessThan(0.01);
    // model world matches layout
    const m3 = buildOrbitModel(snap.nodes, "c3");
    const m4 = buildOrbitModel(snap.nodes, "c4");
    const p3 = m3.world.find((n) => n.id === "c3")!;
    const p3b = m4.world.find((n) => n.id === "c3")!;
    expect(p3.x).toBe(p3b.x);
    expect(p3.y).toBe(p3b.y);
  });
});
