import { describe, expect, it } from "vitest";
import type { Turn } from "../types";
import { messagesFromTurns } from "./turnHelpers";

function t(id: string, user: string, ai: string): Turn {
  return {
    id,
    title: id,
    collapsed: false,
    user,
    aiHtml: `<p>${ai}</p>`,
    think: "",
    thinkOpen: false,
  };
}

describe("messagesFromTurns compact", () => {
  it("folds older turns into a system compact and keeps last 2 full", () => {
    const turns = [
      t("t0", "早问0", "早答0"),
      t("t1", "早问1", "早答1"),
      t("t2", "近问2", "近答2"),
      t("t3", "近问3", "近答3"),
    ];
    const msgs = messagesFromTurns(turns, {
      includeAssistantAtUntil: true,
      compactMeta: { title: "卡", kind: "deepen" },
    });
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[0]!.content).toContain("### Goal");
    expect(msgs[0]!.content).toContain("早问0");
    // last two turns full as user/assistant pairs
    const roles = msgs.slice(1).map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "user", "assistant"]);
    expect(msgs.some((m) => m.content === "近问2")).toBe(true);
    expect(msgs.some((m) => m.content === "近答3")).toBe(true);
    // older user lines not as raw user messages
    expect(msgs.filter((m) => m.role === "user").map((m) => m.content)).toEqual([
      "近问2",
      "近问3",
    ]);
  });

  it("stays flat when compact:false", () => {
    const turns = [t("a", "u0", "a0"), t("b", "u1", "a1"), t("c", "u2", "a2")];
    const msgs = messagesFromTurns(turns, {
      compact: false,
      includeAssistantAtUntil: true,
    });
    expect(msgs.every((m) => m.role !== "system")).toBe(true);
    expect(msgs.filter((m) => m.role === "user")).toHaveLength(3);
  });
});
