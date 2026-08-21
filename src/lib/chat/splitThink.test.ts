import { describe, expect, it } from "vitest";
import { splitThinkContent, stripThinkForExplain } from "./splitThink";
import { parseAssistantContent } from "./openaiCompat";

describe("splitThinkContent", () => {
  it("peels <think> blocks out of formal text", () => {
    const r = splitThinkContent(
      "<think>先对齐定义</think>\n函子保住复合与单位。",
    );
    expect(r.think).toBe("先对齐定义");
    expect(r.text).toBe("函子保住复合与单位。");
  });

  it("handles labeled 思考过程 preamble", () => {
    const r = splitThinkContent(
      "思考过程：\n这里推理一下\n\n答案：正式输出。",
    );
    expect(r.think).toContain("这里推理一下");
    expect(r.text).toContain("正式输出");
  });

  it("peels fenced ```thinking blocks", () => {
    const r = splitThinkContent("```thinking\nplan\n```\n\n正式答案。");
    expect(r.think).toBe("plan");
    expect(r.text).toBe("正式答案。");
  });

  it("stripThinkForExplain never returns think body", () => {
    expect(
      stripThinkForExplain("<think>secret</think>\n短解释正文。"),
    ).toBe("短解释正文。");
    expect(stripThinkForExplain("<think>only think</think>")).toBe("");
  });
});

describe("parseAssistantContent + think", () => {
  it("returns think separately from marks text", () => {
    const r = parseAssistantContent(
      "<think>plan</think>\n关于 [[函子]] 的说明。",
    );
    expect(r.think).toBe("plan");
    expect(r.text).toContain("函子");
    expect(r.marks?.[0]?.term).toBe("函子");
  });

  it("also accepts fullwidth 【term】 marks", () => {
    const r = parseAssistantContent("见 【自然变换】 与 [[伴随]]。");
    expect(r.marks?.map((m) => m.term).sort()).toEqual(["伴随", "自然变换"]);
    expect(r.text).not.toContain("【");
    expect(r.text).not.toContain("[[");
  });
});
