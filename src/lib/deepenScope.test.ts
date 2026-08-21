import { describe, expect, it } from "vitest";
import type { Edge, InquiryNode, Turn } from "../types";
import {
  buildDeepenScope,
  buildForkScope,
  inboundEdge,
  outboundEdges,
} from "./deepenScope";
import { buildInquirySystemPrompt } from "./chat/systemPrompt";

const nodes: InquiryNode[] = [
  {
    id: "c1",
    title: "父",
    parentId: null,
    kind: "root",
    unread: false,
    status: "active",
    question: "父问题是什么？",
    stuck: "卡在定义",
    next: "先写例子",
  },
  {
    id: "c2",
    title: "深挖子",
    parentId: "c1",
    kind: "deepen",
    unread: false,
    status: "active",
  },
  {
    id: "c3",
    title: "发散子",
    parentId: "c1",
    kind: "diverge",
    unread: false,
    status: "active",
  },
];

function turn(
  id: string,
  user: string,
  ai: string,
  title = id,
): Turn {
  return {
    id,
    title,
    collapsed: false,
    user,
    aiHtml: ai,
    think: "",
    thinkOpen: false,
  };
}

const turnsByCardId: Record<string, Turn[]> = {
  c1: [
    turn("t-p0", "很早的父问", "很早的父答 parent-old-should-compact"),
    turn("t-p1", "中间父问", "中间父答"),
    turn(
      "t-parent",
      "最近父用户完整一句不要截断太狠",
      "parent full transcript recent assistant body that must stay complete",
    ),
  ],
  c2: [
    turn("t-child-0", "从「函子」往下", "child"),
  ],
  c3: [],
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
  it("hard context + parent compact of older + full last 1–2 parent turns", () => {
    const scope = buildDeepenScope("c2", "e1", { nodes, turnsByCardId, edges });
    expect(scope).not.toBeNull();
    expect(scope!.kind).toBe("deepen");
    expect(scope!.lineage).toEqual(["父"]);
    expect(scope!.parent.title).toBe("父");
    expect(scope!.parent.question).toBe("父问题是什么？");
    expect(scope!.span.text).toBe("函子");
    expect(scope!.why).toBe("想弄清定义");

    // Pi: 3 parent turns → 1 older compacted, 2 recent full
    expect(scope!.parentCompactedTurnCount).toBe(1);
    expect(scope!.parentCompact).toContain("### Goal");
    expect(scope!.parentCompact).toContain("parent-old-should-compact");
    expect(scope!.parentRecent).toHaveLength(2);
    // full fidelity on recent (not 280-char clip)
    expect(scope!.parentRecent[1]!.user).toBe("最近父用户完整一句不要截断太狠");
    expect(scope!.parentRecent[1]!.assistant).toContain(
      "parent full transcript recent assistant body that must stay complete",
    );
    // child only
    expect(scope!.recentTurns).toHaveLength(1);
    expect(scope!.recentTurns[0]!.id).toBe("t-child-0");
    expect(scope!.recentTurns.every((t) => t.id !== "t-parent")).toBe(true);
  });

  it("scope never puts full parent turns into recentTurns", () => {
    const scope = buildDeepenScope("c2", "e1", { nodes, turnsByCardId, edges });
    expect(scope!.recentTurns.map((t) => t.aiHtml).join("")).not.toContain(
      "parent full transcript",
    );
  });

  it("returns null for missing / mismatched edge", () => {
    expect(buildDeepenScope("c2", "nope", { nodes, turnsByCardId, edges })).toBeNull();
    expect(buildDeepenScope("c2", "e2", { nodes, turnsByCardId, edges })).toBeNull();
    expect(buildDeepenScope("c1", "e1", { nodes, turnsByCardId, edges })).toBeNull();
  });

  it("caps child recent turns without pulling parent into recentTurns", () => {
    const many: Turn[] = Array.from({ length: 12 }, (_, i) =>
      turn(`t-${i}`, `u${i}`, `a${i}`),
    );
    const scope = buildDeepenScope("c2", "e1", {
      nodes,
      turnsByCardId: { ...turnsByCardId, c2: many },
      edges,
    });
    expect(scope!.recentTurns).toHaveLength(8);
    expect(scope!.recentTurns[0]!.id).toBe("t-4");
  });
});

describe("buildForkScope", () => {
  it("covers diverge with compact packing", () => {
    const scope = buildForkScope("c3", "e2", { nodes, turnsByCardId, edges });
    expect(scope).not.toBeNull();
    expect(scope!.kind).toBe("diverge");
    expect(scope!.lineage).toEqual(["父"]);
    expect(scope!.span.text).toBe("范畴");
    expect(scope!.parentRecent.length).toBe(2);
    expect(scope!.parentCompact).toContain("### Goal");
  });
});

describe("system prompt packing", () => {
  it("emits hard + compact + full recent sections", () => {
    const scope = buildForkScope("c2", "e1", { nodes, turnsByCardId, edges });
    const prompt = buildInquirySystemPrompt(scope);
    expect(prompt).toContain("## Hard context");
    expect(prompt).toContain("## Parent compact");
    expect(prompt).toContain("Parent recent dialogue (full");
    expect(prompt).toContain("最近父用户完整一句不要截断太狠");
    expect(prompt).toContain("parent-old-should-compact");
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
