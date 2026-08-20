import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demoSeed";
import {
  ancestorChain,
  collapseCrumbs,
  collectSubtreeIds,
  ELLIPSIS_CRUMB_ID,
  kindGlyph,
  locusNodes,
  nextFocusAfterDelete,
} from "./treeNav";

describe("treeNav", () => {
  const nodes = demoSnapshot().nodes;

  it("ancestorChain root → focus", () => {
    const chain = ancestorChain(nodes, "c3").map((n) => n.id);
    expect(chain).toEqual(["c1", "c2", "c3"]);
  });

  it("locusNodes includes parent siblings children", () => {
    const ids = new Set(locusNodes(nodes, "c3").map((n) => n.id));
    // parent c2, siblings of c3 under c2: c3,c4,c5; children of c3: none
    expect(ids.has("c2")).toBe(true);
    expect(ids.has("c3")).toBe(true);
    expect(ids.has("c4")).toBe(true);
    expect(ids.has("c5")).toBe(true);
    expect(ids.has("c1")).toBe(false);
  });

  it("kindGlyph encodes edge kinds", () => {
    expect(kindGlyph("root")).toBe("●");
    expect(kindGlyph("deepen")).toBe("↓");
    expect(kindGlyph("diverge")).toBe("↗");
  });

  it("collapseCrumbs keeps short chains", () => {
    const c = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
    ];
    expect(collapseCrumbs(c)).toEqual(c);
  });

  it("collectSubtreeIds includes self and descendants", () => {
    const leaf = collectSubtreeIds(nodes, "c3");
    expect([...leaf].sort()).toEqual(["c3"]);
    const mid = collectSubtreeIds(nodes, "c2");
    expect(mid.has("c2")).toBe(true);
    expect(mid.has("c3")).toBe(true);
    expect(mid.has("c4")).toBe(true);
    expect(mid.has("c5")).toBe(true);
    expect(mid.has("c1")).toBe(false);
    expect(collectSubtreeIds(nodes, "missing").size).toBe(0);
  });

  it("nextFocusAfterDelete prefers parent then sibling", () => {
    const delC3 = collectSubtreeIds(nodes, "c3");
    expect(nextFocusAfterDelete(nodes, delC3, "c3", "c3")).toBe("c2");
    const delC2 = collectSubtreeIds(nodes, "c2");
    expect(nextFocusAfterDelete(nodes, delC2, "c3", "c2")).toBe("c1");
    expect(nextFocusAfterDelete(nodes, delC3, "c1", "c3")).toBe("c1");
  });

  it("nextFocusAfterDelete emptying the tree is empty string", () => {
    const all = collectSubtreeIds(nodes, "c1");
    expect(nextFocusAfterDelete(nodes, all, "c3", "c1")).toBe("");
  });

  it("collapseCrumbs folds deep chains to root/…/parent/current", () => {
    const c = [
      { id: "a", title: "A" },
      { id: "b", title: "B" },
      { id: "c", title: "C" },
      { id: "d", title: "D" },
      { id: "e", title: "E" },
    ];
    const out = collapseCrumbs(c);
    expect(out.map((x) => x.id)).toEqual([
      "a",
      ELLIPSIS_CRUMB_ID,
      "d",
      "e",
    ]);
  });
});
