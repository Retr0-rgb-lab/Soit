import { describe, expect, it } from "vitest";
import type { Edge, InquiryNode, Turn } from "../types";
import {
  BRIEF_INSTRUCTIONS,
  BRIEF_MESSAGE_CAP,
  buildCardBrief,
  cardBriefToMarkdown,
  messagesFromCardTurns,
  parseAssistantImport,
} from "./cardBrief";

/** Unique parent-turn body — must never leak into child brief. */
const PARENT_TURN_LEAK_MARKER =
  "PARENT_TURN_SECRET_BODY_xyz_must_not_appear_in_brief";

const nodes: InquiryNode[] = [
  {
    id: "c1",
    title: "父卡",
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
    title: "深挖子卡",
    parentId: "c1",
    kind: "deepen",
    unread: false,
    status: "active",
    question: "子问题",
    stuck: null,
    next: "继续推",
  },
  {
    id: "c3",
    title: "发散卡",
    parentId: "c1",
    kind: "diverge",
    unread: false,
  },
];

const turnsByCardId: Record<string, Turn[]> = {
  c1: [
    {
      id: "t-parent",
      title: "p",
      collapsed: false,
      user: "父用户问句也不得泄漏",
      aiHtml: `<p>${PARENT_TURN_LEAK_MARKER}</p>`,
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
      aiHtml: "子卡回复含 <span class=\"mark\" data-term=\"函子\">函子</span>",
      think: "",
      thinkOpen: false,
    },
    {
      id: "t-child-1",
      title: "follow",
      collapsed: false,
      user: "再问一层",
      aiHtml: "第二轮助手",
      think: "",
      thinkOpen: false,
    },
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

describe("buildCardBrief", () => {
  it("builds child brief with this-card messages and deepen parent fields only", () => {
    const brief = buildCardBrief({
      cardId: "c2",
      nodes,
      turnsByCardId,
      edges,
      now: "2026-08-20T12:00:00.000Z",
      vaultPath: "/vault",
      skillsText: "skill-body",
    });

    expect(brief.version).toBe(1);
    expect(brief.exportedAt).toBe("2026-08-20T12:00:00.000Z");
    expect(brief.cardId).toBe("c2");
    expect(brief.title).toBe("深挖子卡");
    expect(brief.kind).toBe("deepen");
    expect(brief.question).toBe("子问题");
    expect(brief.vaultPath).toBe("/vault");
    expect(brief.skillsText).toBe("skill-body");
    expect(brief.instructions).toBe(BRIEF_INSTRUCTIONS);

    expect(brief.messages).toEqual([
      { role: "user", content: "从「函子」往下" },
      { role: "assistant", content: "子卡回复含 函子" },
      { role: "user", content: "再问一层" },
      { role: "assistant", content: "第二轮助手" },
    ]);

    expect(brief.deepen).toEqual({
      parent: {
        title: "父卡",
        status: "active",
        question: "父问题是什么？",
        stuck: "卡在定义",
        next: "先写例子",
      },
      span: { text: "函子", turnId: "t-parent" },
      why: "想弄清定义",
    });
  });

  it("does not leak parent turn body into brief JSON or markdown", () => {
    const brief = buildCardBrief({
      cardId: "c2",
      nodes,
      turnsByCardId,
      edges,
      now: "2026-08-20T12:00:00.000Z",
    });
    const json = JSON.stringify(brief);
    const md = cardBriefToMarkdown(brief);

    expect(json).not.toContain(PARENT_TURN_LEAK_MARKER);
    expect(md).not.toContain(PARENT_TURN_LEAK_MARKER);
    expect(json).not.toContain("父用户问句也不得泄漏");
    expect(md).not.toContain("父用户问句也不得泄漏");

    // Parent inquiry fields are allowed; parent transcript is not.
    expect(brief.deepen?.parent.title).toBe("父卡");
    expect(brief.messages.every((m) => !m.content.includes(PARENT_TURN_LEAK_MARKER))).toBe(
      true,
    );
    // No foreign card ids in messages payload
    expect(json).not.toMatch(/"cardId":"c1"/);
  });

  it("omits deepen block for diverge / root", () => {
    const diverge = buildCardBrief({
      cardId: "c3",
      nodes,
      turnsByCardId,
      edges,
      now: "2026-08-20T12:00:00.000Z",
    });
    expect(diverge.deepen).toBeUndefined();
    expect(diverge.kind).toBe("diverge");
    expect(diverge.messages).toEqual([]);

    const root = buildCardBrief({
      cardId: "c1",
      nodes,
      turnsByCardId,
      edges,
      now: "2026-08-20T12:00:00.000Z",
    });
    expect(root.deepen).toBeUndefined();
    expect(root.messages.some((m) => m.content.includes(PARENT_TURN_LEAK_MARKER))).toBe(
      true,
    );
  });

  it(`caps messages at BRIEF_MESSAGE_CAP (${BRIEF_MESSAGE_CAP})`, () => {
    const many: Turn[] = Array.from({ length: 20 }, (_, i) => ({
      id: `t-${i}`,
      title: `t${i}`,
      collapsed: false,
      user: `u${i}`,
      aiHtml: `a${i}`,
      think: "",
      thinkOpen: false,
    }));
    const brief = buildCardBrief({
      cardId: "c2",
      nodes,
      turnsByCardId: { ...turnsByCardId, c2: many },
      edges,
      now: "2026-08-20T12:00:00.000Z",
    });
    // 16 turns × (user+assistant) = 32 messages, all from last 16 turns
    expect(brief.messages).toHaveLength(BRIEF_MESSAGE_CAP * 2);
    expect(brief.messages[0]).toEqual({ role: "user", content: "u4" });
    expect(brief.messages.at(-1)).toEqual({ role: "assistant", content: "a19" });
    expect(JSON.stringify(brief)).not.toContain(PARENT_TURN_LEAK_MARKER);
  });
});

describe("messagesFromCardTurns", () => {
  it("strips html and respects custom cap", () => {
    const turns: Turn[] = [
      {
        id: "a",
        title: "",
        collapsed: false,
        user: "u0",
        aiHtml: "<b>hi</b>",
        think: "",
        thinkOpen: false,
      },
      {
        id: "b",
        title: "",
        collapsed: false,
        user: "u1",
        aiHtml: "plain",
        think: "",
        thinkOpen: false,
      },
    ];
    expect(messagesFromCardTurns(turns, 1)).toEqual([
      { role: "user", content: "u1" },
      { role: "assistant", content: "plain" },
    ]);
  });
});

describe("cardBriefToMarkdown", () => {
  it("includes instructions and child messages, not parent transcript", () => {
    const brief = buildCardBrief({
      cardId: "c2",
      nodes,
      turnsByCardId,
      edges,
      now: "2026-08-20T12:00:00.000Z",
    });
    const md = cardBriefToMarkdown(brief);
    expect(md).toContain("# 深挖子卡");
    expect(md).toContain("## Deepen");
    expect(md).toContain("parent.title: 父卡");
    expect(md).toContain("span.text: 函子");
    expect(md).toContain("### user");
    expect(md).toContain("从「函子」往下");
    expect(md).toContain("## Instructions");
    expect(md).toContain(BRIEF_INSTRUCTIONS);
    expect(md).not.toContain(PARENT_TURN_LEAK_MARKER);
  });
});

describe("parseAssistantImport", () => {
  it("reuses [[term]] parsing", () => {
    const r = parseAssistantImport("先看 [[函子]] 再看 [[范畴]]。");
    expect(r.text).toBe("先看 函子 再看 范畴。");
    expect(r.marks?.map((m) => m.term)).toEqual(["函子", "范畴"]);
  });
});
