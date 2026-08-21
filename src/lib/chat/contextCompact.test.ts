import { describe, expect, it } from "vitest";
import type { Turn } from "../../types";
import {
  KEEP_RECENT_TURNS,
  buildStructuredCompact,
  compactThread,
  formatRecentDialogue,
  splitKeepRecent,
  turnToCompactTurn,
} from "./contextCompact";

function t(
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
    aiHtml: `<p>${ai}</p>`,
    think: "",
    thinkOpen: false,
  };
}

describe("splitKeepRecent", () => {
  it("keeps last 2 and puts the rest in older", () => {
    const items = [1, 2, 3, 4, 5];
    const { older, recent } = splitKeepRecent(items, 2);
    expect(older).toEqual([1, 2, 3]);
    expect(recent).toEqual([4, 5]);
  });

  it("when short, older is empty and recent is all", () => {
    const { older, recent } = splitKeepRecent(["a"], 2);
    expect(older).toEqual([]);
    expect(recent).toEqual(["a"]);
  });
});

describe("compactThread", () => {
  it("keeps last 1–2 turns full and compacts older into Pi-like sections", () => {
    const turns = [
      t("t0", "从线性代数开始", "对象与映射", "根"),
      t("t1", "范畴怎么接", "对象≈结构，态射≈映射", "入门"),
      t("t2", "函子是什么", "函子保住复合与单位", "函子"),
      t("t3", "再举一例", "向量空间范畴上的遗忘函子", "例子"),
    ];
    const r = compactThread(turns, {
      title: "范畴论",
      question: "如何从线代接到范畴",
      stuck: "术语太多",
      next: "写自然变换",
      spanText: "函子",
      kind: "deepen",
    });
    expect(r.compactedTurnCount).toBe(2);
    expect(r.recent).toHaveLength(KEEP_RECENT_TURNS);
    expect(r.recent[0]!.user).toBe("函子是什么");
    expect(r.recent[1]!.assistant).toContain("遗忘函子");
    // full fidelity — not the old 280-char clip
    expect(r.recent[1]!.assistant).toBe("向量空间范畴上的遗忘函子");
    expect(r.compact).toContain("### Goal");
    expect(r.compact).toContain("### Progress (Done)");
    expect(r.compact).toContain("### Key Decisions");
    expect(r.compact).toContain("分叉锚点「函子」");
    expect(r.compact).toContain("从线性代数开始");
  });

  it("does not invent compact when ≤ keepRecent turns", () => {
    const turns = [t("a", "u1", "a1"), t("b", "u2", "a2")];
    const r = compactThread(turns, { title: "x" });
    expect(r.compact).toBeNull();
    expect(r.compactedTurnCount).toBe(0);
    expect(r.recent).toHaveLength(2);
    expect(r.recent[0]!.user).toBe("u1");
  });
});

describe("buildStructuredCompact", () => {
  it("returns empty for no older turns", () => {
    expect(buildStructuredCompact([])).toBe("");
  });
});

describe("formatRecentDialogue", () => {
  it("emits full user/assistant blocks", () => {
    const text = formatRecentDialogue([
      turnToCompactTurn(t("x", "完整用户问", "完整助手答")),
    ]);
    expect(text).toContain("完整用户问");
    expect(text).toContain("完整助手答");
    expect(text).toContain("user:");
    expect(text).toContain("assistant:");
  });
});
