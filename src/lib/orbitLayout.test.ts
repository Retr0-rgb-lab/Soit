import { describe, expect, it } from "vitest";
import type { InquiryNode } from "../types";
import { demoSnapshot } from "./demoSeed";
import { buildOrbitModel, childrenOf } from "./orbitLayout";

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

describe("buildOrbitModel", () => {
  it("returns empty center for unknown focus", () => {
    const model = buildOrbitModel([], "missing");
    expect(model.center).toBeNull();
    expect(model.rootId).toBeNull();
    expect(model.focusId).toBe("missing");
    expect(model.rings[0]).toEqual([]);
    expect(model.rings[1]).toEqual([]);
    expect(model.rings[2]).toEqual([]);
  });

  it("places a single root at center with empty rings", () => {
    const nodes = [node({ id: "r", title: "Alone", parentId: null, kind: "root" })];
    const model = buildOrbitModel(nodes, "r");
    expect(model.center).toMatchObject({
      id: "r",
      title: "Alone",
      kind: "root",
      ring: 0,
      parentId: null,
    });
    expect(model.rootId).toBe("r");
    expect(model.rings[1]).toEqual([]);
    expect(model.rings[2]).toEqual([]);
  });

  it("puts deepen+diverge children on ring 1 when focus is root", () => {
    const nodes: InquiryNode[] = [
      node({ id: "r", title: "Root", parentId: null, kind: "root" }),
      node({ id: "div", title: "Diverge", parentId: "r", kind: "diverge", unread: true }),
      node({ id: "dep", title: "Deepen", parentId: "r", kind: "deepen" }),
    ];
    const model = buildOrbitModel(nodes, "r");
    expect(model.center?.id).toBe("r");
    expect(model.rings[1].map((i) => i.id)).toEqual(["dep", "div"]);
    expect(model.rings[1][0]).toMatchObject({
      kind: "deepen",
      ring: 1,
      parentId: "r",
    });
    expect(model.rings[1][1]).toMatchObject({
      kind: "diverge",
      unread: true,
      ring: 1,
    });
    expect(model.rings[2]).toEqual([]);
  });

  it("outer ring: children of focus when on ring1; siblings when deeper", () => {
    const snap = demoSnapshot();
    // c1 → c2 → c3; focus c3 → ring1 kids of c1; ring2 = siblings under c2
    const atC3 = buildOrbitModel(snap.nodes, "c3");
    expect(atC3.center?.id).toBe("c1");
    expect(atC3.rootId).toBe("c1");
    expect(atC3.rings[1].map((i) => i.id)).toEqual(["c2"]);
    expect(atC3.rings[2].map((i) => i.id)).toEqual(["c3", "c4", "c5"]);

    // focus c2 → outer ring = children of c2
    const atC2 = buildOrbitModel(snap.nodes, "c2");
    expect(atC2.center?.id).toBe("c1");
    expect(atC2.rings[1].map((i) => i.id)).toEqual(["c2"]);
    expect(atC2.rings[2].map((i) => i.id)).toEqual(["c3", "c4", "c5"]);
    expect(atC2.rings[2].every((i) => i.ring === 2)).toBe(true);
  });

  it("respects ringCap on each ring", () => {
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
      node({ id: "mid", title: "Mid", parentId: "r", kind: "deepen" }),
      ...Array.from({ length: 5 }, (_, i) =>
        node({
          id: `g${i}`,
          title: `Grand ${i}`,
          parentId: "mid",
          kind: "deepen",
        }),
      ),
    ];
    const model = buildOrbitModel(nodes, "mid", { ringCap: 3 });
    expect(model.rings[1]).toHaveLength(3);
    expect(model.rings[2]).toHaveLength(3);
    expect(model.rings[2].map((i) => i.id)).toEqual(["g0", "g1", "g2"]);
  });
});
