import { describe, expect, it } from "vitest";
import type { Edge, InquiryNode, Turn } from "../types";
import {
  buildDeepenScope,
  inboundEdge,
  outboundEdges,
} from "./deepenScope";

const nodes: InquiryNode[] = [
  {
    id: "c1",
    title: "父",
    parentId: null,
    kind: "root",
    unread: false,
    status: "active",
  },
  {
    id: "c2",
    title: "深挖子",
    parentId: "c1",
    kind: "deepen",
    unread: false,
    status: "active",
  },
];

const turnsByCardId: Record<string, Turn[]> = {
  c1: [
    {
      id: "t-parent",
      title: "p",
      collapsed: false,
      user: "q",
      aiHtml: "parent full transcript should not appear in scope",
      think: "",
      thinkOpen: false,
    },
  ],
  c2: [
    {
      id: "t-child-0",
      title: "seed",
      collapsed: false,
      user: "从「函子」往下",
      aiHtml: "child",
      think: "",
      thinkOpen: false,
    },
  ],
};

const edges: Edge[] = [
  {
    id: "e1",
    kind: "deepen",
    fromCardId: "c1",
    toCardId: "c2",
    source: { turnId: "t-parent", text: "函子", markId: "m1" },
    why: "想弄清定义",
    actor: "user",
  },
  {
    id: "e2",
    kind: "diverge",
    fromCardId: "c1",
    toCardId: "c3",
    source: { turnId: "t-parent", text: "范畴" },
  },
];

describe("buildDeepenScope", () => {
  it("returns span, why, parentStatus, and child recent turns only", () => {
    const scope = buildDeepenScope("c2", "e1", { nodes, turnsByCardId, edges });
    expect(scope).not.toBeNull();
    expect(scope!.span.text).toBe("函子");
    expect(scope!.span.turnId).toBe("t-parent");
    expect(scope!.span.markId).toBe("m1");
    expect(scope!.why).toBe("想弄清定义");
    expect(scope!.parentStatus).toBe("active");
    expect(scope!.recentTurns).toHaveLength(1);
    expect(scope!.recentTurns[0]!.id).toBe("t-child-0");
    // must not include parent turns
    expect(scope!.recentTurns.every((t) => t.id !== "t-parent")).toBe(true);
  });

  it("returns null for missing / mismatched edge", () => {
    expect(buildDeepenScope("c2", "nope", { nodes, turnsByCardId, edges })).toBeNull();
    expect(buildDeepenScope("c2", "e2", { nodes, turnsByCardId, edges })).toBeNull();
    expect(buildDeepenScope("c1", "e1", { nodes, turnsByCardId, edges })).toBeNull();
  });

  it("caps recent turns without pulling parent transcript", () => {
    const many: Turn[] = Array.from({ length: 12 }, (_, i) => ({
      id: `t-${i}`,
      title: `t${i}`,
      collapsed: false,
      user: `u${i}`,
      aiHtml: `a${i}`,
      think: "",
      thinkOpen: false,
    }));
    const scope = buildDeepenScope("c2", "e1", {
      nodes,
      turnsByCardId: { ...turnsByCardId, c2: many },
      edges,
    });
    expect(scope!.recentTurns).toHaveLength(8);
    expect(scope!.recentTurns[0]!.id).toBe("t-4");
    expect(scope!.recentTurns.map((t) => t.aiHtml).join("")).not.toContain(
      "parent full transcript",
    );
  });
});

describe("edge helpers", () => {
  it("outboundEdges lists children from a card", () => {
    expect(outboundEdges("c1", edges).map((e) => e.id)).toEqual(["e1", "e2"]);
    expect(outboundEdges("c2", edges)).toEqual([]);
  });

  it("inboundEdge finds creator edge", () => {
    expect(inboundEdge("c2", edges)?.id).toBe("e1");
    expect(inboundEdge("missing", edges)).toBeUndefined();
  });
});
